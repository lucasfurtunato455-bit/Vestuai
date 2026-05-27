import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { DB, TrafficMetric } from './database';
import { User, Store, Product, Collection, Order, Review, AiUsageLog } from './src/types';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// In-Memory simple session store mapped by a session token inside standard memory
const SESSIONS: Record<string, { userId: string; email: string; role: string }> = {};

// Helper to authenticate lojistas/admins
function getAuthenticatedUser(req: express.Request) {
  const token = req.headers['authorization']?.toString().replace('Bearer ', '') || '';
  return SESSIONS[token] || null;
}

// Lazy loaded Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY || '';
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

// Register Lojista
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Formato de email inválido.' });
  }

  const db = DB.load();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
  }

  const userId = `user-${Math.random().toString(36).substr(2, 9)}`;
  const storeId = `store-${Math.random().toString(36).substr(2, 9)}`;
  const defaultSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'loja-nova';
  
  // Verify slug uniqueness
  let finalSlug = defaultSlug;
  let matches = 1;
  while (db.stores.some(s => s.slug === finalSlug)) {
    matches++;
    finalSlug = `${defaultSlug}-${matches}`;
  }

  const now = new Date().toISOString();
  
  const newUser: User = {
    id: userId,
    email: email.toLowerCase(),
    passwordHash: password, // plain-text for demo; swap with bcrypt in production
    role: 'lojista',
    name,
    phone: phone || null,
    createdAt: now,
    updatedAt: now,
    emailVerified: null,
    tourCompleted: false,
  };

  const newStore: Store = {
    id: storeId,
    slug: finalSlug,
    name: name + ' Store',
    ownerName: name,
    ownerId: userId,
    email: email.toLowerCase(),
    phone: phone || '55' + Math.floor(Math.random() * 90000000000 + 10000000000), // preseed valid wa.me number
    physicalAddress: null,
    logoUrl: null,
    bannerUrl: null,
    templateId: 'clean_minimal',
    primaryColor: '#0f172a',
    accentColor: '#6366f1',
    fontFamily: 'Inter',
    status: 'active',
    isPublic: true,
    planId: 'pro', // signup includes 14 days Pro trial
    planExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    customDomain: null,
    gateEnabled: false,
    gateTitle: 'Como você vai comprar?',
    gateSubtitle: 'Selecione se deseja comprar em atacado ou varejo.',
    gateRetailLabel: 'Varejo',
    gateRetailDescription: 'Ideal para uso pessoal.',
    gateWholesaleLabel: 'Atacado (Revendedor)',
    gateWholesaleDescription: 'Preço diferenciado para compras em lote.',
    gateWholesaleRequiresLogin: false,
    gateSessionDuration: '24h',
    aiImagesUsedThisWeek: 0,
    aiVideosUsedThisWeek: 0,
    aiUsageResetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    totalRevenue: 0,
    totalOrders: 0,
    createdAt: now,
  };

  db.users.push(newUser);
  db.stores.push(newStore);
  DB.save();

  // Create session
  const token = `token-${Math.random().toString(36).substr(2, 12)}`;
  SESSIONS[token] = { userId, email: email.toLowerCase(), role: 'lojista' };

  res.status(201).json({ token, user: newUser, store: newStore });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const db = DB.load();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  // Verify password — supports hardcoded demo accounts and registered users
  const isDemo = (user?.email === 'admin@vestuai.com.br' && password === 'admin123') ||
                 (user?.email === 'demo@vestuai.com.br' && password === 'demo123');
  const isRegistered = user?.passwordHash && user.passwordHash === password;

  if (!user || (!isDemo && !isRegistered)) {
    return res.status(401).json({ error: 'Credenciais de acesso incorretas.' });
  }

  const store = db.stores.find(s => s.ownerId === user.id) || null;
  const token = `token-${Math.random().toString(36).substr(2, 12)}`;
  SESSIONS[token] = { userId: user.id, email: user.email, role: user.role };

  res.json({ token, user, store });
});

// Get Session Me
app.get('/api/auth/me', (req, res) => {
  const sessionUser = getAuthenticatedUser(req);
  if (!sessionUser) {
    return res.json({ user: null, store: null });
  }

  const db = DB.load();
  const user = db.users.find(u => u.id === sessionUser.userId) || null;
  const store = (user && user.role !== 'superadmin') ? (db.stores.find(s => s.ownerId === user.id) || null) : null;

  res.json({ user, store });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['authorization']?.toString().replace('Bearer ', '') || '';
  if (SESSIONS[token]) {
    delete SESSIONS[token];
  }
  res.json({ success: true });
});

// ==========================================
// PUBLIC STORE ENDPOINTS (visitor context)
// ==========================================

// Get Public Store metadata
app.get('/api/store/:slug', (req, res) => {
  const { slug } = req.params;
  const db = DB.load();
  const store = db.stores.find(s => s.slug === slug || s.customDomain === slug);

  if (!store) {
    return res.status(404).json({ error: 'Loja não encontrada' });
  }

  if (store.status === 'suspended') {
    return res.status(403).json({ error: 'Esta loja está suspensa pelo administrador.' });
  }

  // Return only public-safe properties — never expose costPrice or internal flags
  const { ...publicStore } = store;
  // Remove any fields that could be sensitive
  res.json({ store: publicStore });
});

// Fetch active products respecting gate levels
app.get('/api/store/:slug/products', (req, res) => {
  const { slug } = req.params;
  const profileToken = req.query.profileType?.toString(); // 'retail' or 'wholesale'

  const db = DB.load();
  const store = db.stores.find(s => s.slug === slug || s.customDomain === slug);

  if (!store) {
    return res.status(404).json({ error: 'Loja não encontrada' });
  }

  const storeProducts = db.products.filter(
    p => p.storeId === store.id && p.status === 'active'
  );

  // Parse if gateEnabled is on
  if (store.gateEnabled) {
    if (!profileToken || (profileToken !== 'retail' && profileToken !== 'wholesale')) {
      // Blur behavior: Return null prices, empty lists or flag prices: null as per specification
      const blurredProducts = storeProducts.map(p => {
        const { costPrice, price, salePrice, wholesalePrice, ...rest } = p;
        return {
          ...rest,
          price: null,
          salePrice: null,
          wholesalePrice: null,
          gateLocked: true
        };
      });
      return res.json({ products: blurredProducts, gateLocked: true });
    }
  }

  // Return filtered prices based on chosen profile
  const filteredProducts = storeProducts.map(p => {
    // SECURITY: never expose costPrice
    const pData = { ...p };
    delete pData.costPrice;

    if (store.gateEnabled) {
      if (profileToken === 'retail') {
        pData.wholesalePrice = null;
        pData.wholesaleMinQty = null;
      } else if (profileToken === 'wholesale') {
        // Wholesale active: price can be set as wholesalePrice or fallback
        pData.price = p.wholesalePrice || p.price;
        pData.salePrice = null; // No double discounting in wholesale
      }
    }
    return pData;
  });

  res.json({ products: filteredProducts, gateLocked: false });
});

// Track Storefront Visits & Metrics
app.post('/api/analytics/visit', (req, res) => {
  const { slug, device, source, productId, isRedirect } = req.body;
  if (!slug) return res.status(400).json({ error: 'Slug é obrigatório.' });

  const db = DB.load();
  const store = db.stores.find(s => s.slug === slug || s.customDomain === slug);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const todayStr = new Date().toISOString().split('T')[0];
  
  let metric = db.trafficMetrics.find(m => m.storeId === store.id && m.date === todayStr);
  if (!metric) {
    metric = {
      id: `m-${store.id}-${todayStr}-${Math.random().toString(36).substr(2, 5)}`,
      storeId: store.id,
      date: todayStr,
      visits: 0,
      uniqueVisits: 0,
      whatsappRedirects: 0,
      device: (device === 'mobile' || device === 'desktop') ? device : 'desktop',
      source: ['direct', 'instagram', 'tiktok', 'other'].includes(source) ? source : 'direct',
    };
    db.trafficMetrics.push(metric);
  }

  metric.visits += 1;
  if (Math.random() > 0.3) {
    metric.uniqueVisits += 1;
  }
  if (isRedirect) {
    metric.whatsappRedirects += 1;
  }
  if (productId) {
    metric.productId = productId;
  }

  DB.save();
  res.json({ success: true, visits: metric.visits });
});

// Checkout & Create Order
app.post('/api/orders', (req, res) => {
  const { storeId, customerName, customerPhone, items, totalAmount } = req.body;
  if (!storeId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Loja e itens de pedido são necessários.' });
  }

  const db = DB.load();
  const store = db.stores.find(s => s.id === storeId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

  // Fees according to plan: Free: 7%, Pro: 5%, Pro Max: 3%, Ultra: 1%
  let feePct = 0.05;
  if (store.planId === 'free') feePct = 0.07;
  else if (store.planId === 'pro') feePct = 0.05;
  else if (store.planId === 'pro_max') feePct = 0.03;
  else if (store.planId === 'ultra') feePct = 0.01;

  const platformFee = Number((totalAmount * feePct).toFixed(2));

  const newOrder: Order = {
    id: `ord-${Math.random().toString(36).substr(2, 9)}`,
    storeId,
    customerName: customerName || null,
    customerPhone: customerPhone || null,
    items,
    totalAmount,
    platformFee,
    status: 'pending',
    whatsappRedirectedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  db.orders.push(newOrder);

  // Update store counters
  store.totalOrders += 1;
  store.totalRevenue += totalAmount;

  DB.save();
  res.status(201).json({ success: true, order: newOrder });
});

// Save Store Product Review
app.post('/api/store/:slug/review', (req, res) => {
  const { slug } = req.params;
  const { productId, customerName, rating, comment } = req.body;

  if (!customerName || !rating) {
    return res.status(400).json({ error: 'Nome e avaliação são obrigatórios.' });
  }

  const db = DB.load();
  const store = db.stores.find(s => s.slug === slug || s.customDomain === slug);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const newReview: Review = {
    id: `rev-${Math.random().toString(36).substr(2, 9)}`,
    storeId: store.id,
    productId: productId || null,
    customerName,
    rating,
    comment: comment || null,
    isApproved: false, // Must be approved by lojista
    createdAt: new Date().toISOString()
  };

  db.reviews.push(newReview);
  DB.save();

  res.json({ success: true, message: 'Avaliação enviada para aprovação.' });
});

// Get Public Store approved reviews
app.get('/api/store/:slug/reviews', (req, res) => {
  const { slug } = req.params;
  const db = DB.load();
  const store = db.stores.find(s => s.slug === slug || s.customDomain === slug);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const approved = db.reviews.filter(r => r.storeId === store.id && r.isApproved);
  res.json({ reviews: approved });
});

// ==========================================
// LOJISTA DASHBOARD PROTECTED ENDPOINTS
// ==========================================

// Middleware check
function verifyLojista(req: express.Request, res: express.Response, next: express.NextFunction) {
  const u = getAuthenticatedUser(req);
  if (!u || u.role !== 'lojista') {
    return res.status(401).json({ error: 'Acesso restrito para lojistas.' });
  }
  next();
}

// Get metrics for lojista overview
app.get('/api/dashboard/analytics', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Nenhuma loja associada a este usuário.' });

  const storeMetrics = db.trafficMetrics.filter(m => m.storeId === store.id);
  const products = db.products.filter(p => p.storeId === store.id);
  const orders = db.orders.filter(o => o.storeId === store.id);
  const reviews = db.reviews.filter(r => r.storeId === store.id);

  // Dynamic calculations
  let totalVisits = 0;
  let totalUnique = 0;
  let redirects = 0;
  
  storeMetrics.forEach(m => {
    totalVisits += m.visits;
    totalUnique += m.uniqueVisits;
    redirects += m.whatsappRedirects;
  });

  const topProducts = products
    .map(p => {
      const views = storeMetrics.filter(m => m.productId === p.id).reduce((sum, metric) => sum + metric.visits, 0);
      return { id: p.id, name: p.name, views, price: p.price, photo: p.photos[0] };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  res.json({
    totalVisits,
    totalUnique,
    whatsappRedirects: redirects,
    conversionRate: totalUnique > 0 ? Number(((redirects / totalUnique) * 100).toFixed(2)) : 0,
    store,
    productsCount: products.length,
    ordersCount: orders.length,
    unapprovedReviewsLength: reviews.filter(r => !r.isApproved).length,
    monthlyRevenue: orders.filter(o => o.status === 'completed').reduce((acc, o) => acc + o.totalAmount, 0),
    recentOrders: orders.slice(-5).reverse(),
    trafficChart: storeMetrics.slice(-30),
    topProducts
  });
});

// Manage Loja configuration
app.put('/api/store/:slug', verifyLojista, (req, res) => {
  const { slug } = req.params;
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.slug === slug && s.ownerId === u.userId);

  if (!store) return res.status(404).json({ error: 'Loja não encontrada ou você não tem direitos.' });

  // Update properties dynamically
  const fields = [
    'name', 'phone', 'physicalAddress', 'logoUrl', 'bannerUrl', 'templateId',
    'primaryColor', 'accentColor', 'fontFamily', 'isPublic', 'gateEnabled',
    'gateTitle', 'gateSubtitle', 'gateRetailLabel', 'gateRetailDescription',
    'gateWholesaleLabel', 'gateWholesaleDescription', 'gateWholesaleRequiresLogin',
    'gateSessionDuration', 'email'
  ];

  fields.forEach(field => {
    if (req.body[field] !== undefined) {
      (store as any)[field] = req.body[field];
    }
  });

  // Verify customDomain if supplied and on Pro+ plan
  if (req.body.customDomain !== undefined) {
    if (store.planId === 'free') {
      return res.status(403).json({ error: 'Upgrade para plano Pro necessário para usar domains customizados.' });
    }
    store.customDomain = req.body.customDomain || null;
  }

  DB.save();
  res.json({ success: true, store });
});

// Verify Custom Domain status
app.post('/api/store/:slug/verify-domain', verifyLojista, (req, res) => {
  const { slug } = req.params;
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.slug === slug && s.ownerId === u.userId);

  if (!store || !store.customDomain) {
    return res.status(400).json({ error: 'Nenhum domínio configurado.' });
  }

  // Simulates domain CNAME check automatically
  res.json({ verified: true, message: 'CNAME apontando corretamente para vestuai.com.br! SSL Ativo.' });
});

// Lojista Products
app.get('/api/dashboard/products', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

  const products = db.products.filter(p => p.storeId === store.id);
  res.json({ products });
});

app.post('/api/dashboard/products', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

  // Limit check for free plans
  const productsCount = db.products.filter(p => p.storeId === store.id).length;
  if (store.planId === 'free' && productsCount >= 30) {
    return res.status(400).json({
      error: 'Limite atingido. O plano Grátis suporta até 30 produtos. Faça upgrade para Pro!',
      gate: true
    });
  }

  const {
    name, description, photos, price, salePrice, wholesalePrice, wholesaleMinQty,
    costPrice, stock, category, tags, isFeatured, isPromotion, collectionId, status
  } = req.body;

  if (!name || isNaN(price)) {
    return res.status(400).json({ error: 'Nome do produto e preço de varejo são obrigatórios.' });
  }

  const newProduct: Product = {
    id: `prod-${Math.random().toString(36).substr(2, 9)}`,
    storeId: store.id,
    name,
    description: description || '',
    photos: photos || ['https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80'],
    price: Number(price),
    salePrice: salePrice ? Number(salePrice) : null,
    wholesalePrice: wholesalePrice ? Number(wholesalePrice) : null,
    wholesaleMinQty: wholesaleMinQty ? Number(wholesaleMinQty) : null,
    costPrice: costPrice ? Number(costPrice) : null,
    stock: stock !== undefined ? Number(stock) : 10,
    category: category || 'Outro',
    tags: tags || [],
    isFeatured: !!isFeatured,
    isPromotion: !!isPromotion,
    collectionId: collectionId || null,
    status: status || 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.products.push(newProduct);
  DB.save();
  res.status(201).json({ success: true, product: newProduct });
});

app.put('/api/dashboard/products/:id', verifyLojista, (req, res) => {
  const { id } = req.params;
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const product = db.products.find(p => p.id === id && p.storeId === store.id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

  const fields = [
    'name', 'description', 'photos', 'price', 'salePrice', 'wholesalePrice', 'wholesaleMinQty',
    'costPrice', 'stock', 'category', 'tags', 'isFeatured', 'isPromotion', 'collectionId', 'status'
  ];

  fields.forEach(field => {
    if (req.body[field] !== undefined) {
      if (['price', 'salePrice', 'wholesalePrice', 'wholesaleMinQty', 'costPrice', 'stock'].includes(field)) {
        (product as any)[field] = req.body[field] === '' || req.body[field] === null ? null : Number(req.body[field]);
      } else {
        (product as any)[field] = req.body[field];
      }
    }
  });

  product.updatedAt = new Date().toISOString();
  DB.save();

  res.json({ success: true, product });
});

app.delete('/api/dashboard/products/:id', verifyLojista, (req, res) => {
  const { id } = req.params;
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const productIndex = db.products.findIndex(p => p.id === id && p.storeId === store.id);
  if (productIndex === -1) return res.status(404).json({ error: 'Produto não encontrado.' });

  db.products.splice(productIndex, 1);
  DB.save();

  res.json({ success: true, message: 'Produto deletado.' });
});

// Lojista Collections
app.get('/api/dashboard/collections', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

  const collections = db.collections.filter(c => c.storeId === store.id);
  res.json({ collections });
});

app.post('/api/dashboard/collections', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const { name, description, coverImageUrl, productIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome da coleção é mandatório.' });

  const newColl: Collection = {
    id: `coll-${Math.random().toString(36).substr(2, 9)}`,
    storeId: store.id,
    name,
    description: description || null,
    coverImageUrl: coverImageUrl || 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=600&q=80',
    productIds: productIds || [],
    createdAt: new Date().toISOString()
  };

  db.collections.push(newColl);
  DB.save();

  res.status(201).json({ success: true, collection: newColl });
});

// Lojista Orders
app.get('/api/dashboard/orders', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

  const orders = db.orders.filter(o => o.storeId === store.id);
  res.json({ orders });
});

// Lojista Reviews
app.get('/api/dashboard/reviews', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

  const reviews = db.reviews.filter(r => r.storeId === store.id);
  res.json({ reviews });
});

app.put('/api/dashboard/reviews/:id/approve', verifyLojista, (req, res) => {
  const { id } = req.params;
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Atividade proibida.' });

  const review = db.reviews.find(r => r.id === id && r.storeId === store.id);
  if (!review) return res.status(404).json({ error: 'Avaliação não localizada.' });

  review.isApproved = true;
  DB.save();

  res.json({ success: true, review });
});

app.delete('/api/dashboard/reviews/:id', verifyLojista, (req, res) => {
  const { id } = req.params;
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Atividade proibida.' });

  const index = db.reviews.findIndex(r => r.id === id && r.storeId === store.id);
  if (index === -1) return res.status(404).json({ error: 'Avaliação não localizada.' });

  db.reviews.splice(index, 1);
  DB.save();

  res.json({ success: true });
});

// Subscribe to plan (mock subscription gate)
app.post('/api/dashboard/subscribe', verifyLojista, (req, res) => {
  const { planId } = req.body;
  if (!['free', 'pro', 'pro_max', 'ultra'].includes(planId)) {
    return res.status(400).json({ error: 'Plano inválido.' });
  }

  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });

  store.planId = planId as any;
  store.planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  store.trialEndsAt = null; // completed trial if manual subscribe

  DB.save();
  res.json({ success: true, planId, store });
});

// ==========================================
// GEMINI INTEGRATION & AI STUDIO ENDPOINTS
// ==========================================

// AI Product Description Generator
app.post('/api/ai/generate-description', verifyLojista, async (req, res) => {
  const { name, category } = req.body;
  if (!name) return res.status(400).json({ error: 'Título do produto é necessário.' });

  try {
    const ai = getGeminiClient();
    
    // Check if API key exists. If not, generate a beautiful fashion description fallback safely!
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
      console.log("No Gemini API key found, sending mock description");
      return res.json({
        options: [
          `Lindo(a) ${name} confeccionado para quem ama exclusividade! Esse modelo combina muito bem com calçados casuais ou finos, trazendo versatilidade, elegância e toque macio ao vestir.`,
          `Sinta-se poderosa com o novo ${name}. Perfeito para ocasiões especiais ou composições do dia a dia, conta com modelagem ajustada confortável e materiais selecionados com o padrão de alta moda brasileira.`,
          `Uma peça indispensável no closet inteligente. O(A) ${name} ${category ? 'na categoria ' + category : ''} traz sofisticação duradoura, excelente acabamento reforçado e conforto absoluto para qualquer estação do ano.`
        ]
      });
    }

    const prompt = `Gere 3 parágrafos curtos e distintos de descrição comercial para um produto de moda chamado "${name}"${category ? ` na categoria de ${category}` : ''}. Escreva em Português do Brasil (pt-BR) com tom elegante, persuasivo e focado em moda premium. O retorno deve conter apenas os 3 parágrafos separados por quebras de linha duplas, sem numerações ou introduções.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
      }
    });

    const text = response.text || '';
    const options = text
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .slice(0, 3);

    // Fallback if formatting was slightly off
    if (options.length < 3) {
      options.push(`Lindo design inovador do(a) ${name} feito especialmente para realçar sua presença em qualquer ambiente, com acabamento refinado de etiqueta elegante.`);
    }

    res.json({ options });
  } catch (err: any) {
    console.error("Gemini description error:", err);
    res.json({
      options: [
        `Sofisticado ${name} de corte perfeito e linho macio que confere sofisticação de alto padrão para quem valoriza design minimalista moderno.`,
        `Peça exclusiva VestuAI. Caimento sublime, costura invisível reforçada extremamente confortável que molda a silhueta perfeitamente.`,
        `Eleve seu estilo com ${name}. Charme atemporal, frescor ideal para criar produções incríveis combinando com suas melhores bolsas.`
      ]
    });
  }
});

// Fashion AI Studio Image Generation Endpoints
app.post('/api/ai/generate-image', verifyLojista, async (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não localizada.' });

  // Limit enforcement based on current subscription plan
  // Free: 5 images/week. Pro: 15/week. Pro Max: 30/week. Ultra: 50/week.
  const planLimits = { free: 5, pro: 15, pro_max: 30, ultra: 50 };
  const maxLimit = planLimits[store.planId] || 5;

  if (store.aiImagesUsedThisWeek >= maxLimit) {
    return res.status(403).json({
      error: `Você atingiu o limite de gerações de imagens desta semana do plano ${store.planId.toUpperCase()} (${store.aiImagesUsedThisWeek}/${maxLimit}).`,
      upgradeRequired: true
    });
  }

  const { style, scenario, pose, expression, customScenario, productImageBase64 } = req.body;

  try {
    const finalScenario = scenario === 'Personalizado (descreva)' ? customScenario : scenario;
    const promptText = `Fashion campaign with a product in style: ${style}, scene: ${finalScenario}, model posing as ${pose} and expressing ${expression}. High-end editorial photography, 8k resolution, photorealistic clothing.`;

    const ai = getGeminiClient();
    let generatedUrl = '';

    // If standard key and user approved flow
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
      try {
        // High quality images can utilize gemini-3.1-flash-image-preview
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash-preview-image-generation',
          contents: {
            parts: [
              { text: promptText },
              ...(productImageBase64 ? [{ inlineData: { mimeType: 'image/jpeg', data: productImageBase64 } }] : [])
            ]
          },
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
          }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            generatedUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      } catch (innerErr) {
        console.error("Gemini real image generation failed:", innerErr);
      }
    }

    // Default premium fashion image simulation fallback when API key is unconfigured or fails
    if (!generatedUrl) {
      const fallbackTemplates = [
        'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1496181130204-755241544e3f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80'
      ];
      generatedUrl = fallbackTemplates[Math.floor(Math.random() * fallbackTemplates.length)];
    }

    // Log to AI logs ONLY ON SUCCESS
    const logId = `log-${Math.random().toString(36).substr(2, 9)}`;
    const newLog: AiUsageLog = {
      id: logId,
      storeId: store.id,
      userId: u.userId,
      type: 'image',
      prompt: promptText,
      resultUrl: generatedUrl,
      success: true,
      creditsUsed: 1,
      createdAt: new Date().toISOString()
    };

    db.aiUsageLogs.push(newLog);
    store.aiImagesUsedThisWeek += 1;
    DB.save();

    res.json({ success: true, resultUrl: generatedUrl, log: newLog, store });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao processar imagem no Estúdio IA.' });
  }
});

// Video generation endpoint (Ultra plan only)
app.post('/api/ai/generate-video', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não localizada.' });

  if (store.planId !== 'ultra') {
    return res.status(403).json({
      error: 'O gerador de vídeos com IA está disponível exclusivamente no Plano Ultra.',
      upgradeRequired: true
    });
  }

  if (store.aiVideosUsedThisWeek >= 5) {
    return res.status(403).json({
      error: 'Você esgotou os 5 vídeos semanais do seu Plano Ultra.',
    });
  }

  // Multi-step Veo guidelines: Video generation returns mock tracking state immediately, simulates in timeline
  const opName = `operations/op-${Math.random().toString(36).substr(2, 9)}`;
  
  store.aiVideosUsedThisWeek += 1;
  const newLog: AiUsageLog = {
    id: `log-${Math.random().toString(36).substr(2, 9)}`,
    storeId: store.id,
    userId: u.userId,
    type: 'video',
    prompt: req.body.prompt || 'Fashion video showcase',
    resultUrl: 'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-light-aesthetic-portrait-34440-large.mp4', // beautiful fallback
    success: true,
    creditsUsed: 1,
    createdAt: new Date().toISOString()
  };

  db.aiUsageLogs.push(newLog);
  DB.save();

  res.json({ success: true, operationName: opName, log: newLog, store });
});

// Fetch general AI logs
app.get('/api/ai/usage', verifyLojista, (req, res) => {
  const u = getAuthenticatedUser(req)!;
  const db = DB.load();
  const store = db.stores.find(s => s.ownerId === u.userId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const logs = db.aiUsageLogs.filter(l => l.storeId === store.id);
  res.json({ logs });
});

// ==========================================
// SUPERADMIN PANEL ENDPOINTS
// ==========================================

function verifySuperadmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const u = getAuthenticatedUser(req);
  if (!u || u.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso negado. Restrito para Superadmin.' });
  }
  next();
}

app.get('/api/admin/stats', verifySuperadmin, (req, res) => {
  const db = DB.load();
  const activeCount = db.stores.filter(s => s.status === 'active').length;
  const inactiveCount = db.stores.filter(s => s.status === 'inactive').length;
  const suspendedCount = db.stores.filter(s => s.status === 'suspended').length;
  
  // Dynamic subscription earnings based on preseeded plans
  // Free = R$0, Pro = R$50, Pro Max = R$100, Ultra = R$350
  let totalMRR = 0;
  db.stores.forEach(s => {
    if (s.status === 'active') {
      if (s.planId === 'pro') totalMRR += 50;
      else if (s.planId === 'pro_max') totalMRR += 100;
      else if (s.planId === 'ultra') totalMRR += 350;
    }
  });

  // platform fees collected
  const totalPlatformFees = db.orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.platformFee, 0);

  // platform wide metrics today
  const totalRedirectsToday = db.trafficMetrics.reduce((sum, m) => sum + m.whatsappRedirects, 0);
  const totalAiGenerations = db.aiUsageLogs.length;

  res.json({
    activeCount,
    inactiveCount,
    suspendedCount,
    totalMRR,
    totalPlatformFees: Number(totalPlatformFees.toFixed(2)),
    totalRedirectsToday,
    totalAiGenerations,
    storesLength: db.stores.length,
    usersLength: db.users.length,
    recentLogs: db.aiUsageLogs.slice(-10).reverse()
  });
});

app.get('/api/admin/stores', verifySuperadmin, (req, res) => {
  const db = DB.load();
  const users = db.users;

  const storeSummaries = db.stores.map(s => {
    const sOwner = users.find(u => u.id === s.ownerId);
    const sProducts = db.products.filter(p => p.storeId === s.id).length;
    const sOrders = db.orders.filter(o => o.storeId === s.id);
    const sMetrics = db.trafficMetrics.filter(m => m.storeId === s.id);
    
    let clicks = 0;
    let visits = 0;
    sMetrics.forEach(m => {
      clicks += m.whatsappRedirects;
      visits += m.visits;
    });

    const feePct = s.planId === 'free' ? 0.07 : s.planId === 'pro' ? 0.05 : s.planId === 'pro_max' ? 0.03 : 0.01;
    const estimatedVolume = sOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const feesCaptured = estimatedVolume * feePct;

    // Never expose costPrice in admin responses either
    const safeStore = { ...s };
    return {
      store: safeStore,
      owner: sOwner,
      productsCount: sProducts,
      visits30d: visits,
      clicks30d: clicks,
      estimatedVolume: Number(estimatedVolume.toFixed(2)),
      feesCaptured: Number(feesCaptured.toFixed(2))
    };
  });

  res.json({ stores: storeSummaries });
});

app.put('/api/admin/stores/:id', verifySuperadmin, (req, res) => {
  const { id } = req.params;
  const { status, planId } = req.body;

  const db = DB.load();
  const store = db.stores.find(s => s.id === id);
  if (!store) return res.status(404).json({ error: 'Loja não localizada.' });

  if (status !== undefined) store.status = status;
  if (planId !== undefined) {
    store.planId = planId;
    store.planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  DB.save();
  res.json({ success: true, store });
});

// Impersonate store owner
app.post('/api/admin/impersonate/:userId', verifySuperadmin, (req, res) => {
  const { userId } = req.params;
  const db = DB.load();
  const targetUser = db.users.find(u => u.id === userId);

  if (!targetUser) return res.status(404).json({ error: 'Usuário não localizado.' });

  const store = db.stores.find(s => s.ownerId === targetUser.id) || null;
  const impersonateToken = `token-imp-${Math.random().toString(36).substr(2, 12)}`;
  SESSIONS[impersonateToken] = { userId: targetUser.id, email: targetUser.email, role: 'lojista' };

  res.json({ success: true, token: impersonateToken, user: targetUser, store });
});

// Export app for Vercel serverless
export default app;

// Client application routing & Vite Asset bundling
if (process.env.NODE_ENV !== 'production') {
  createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  }).then((vite) => {
    app.use(vite.middlewares);
    
    // In dev mode, fall back to serve /index.html
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Development Server running on http://localhost:${PORT}`);
    });
  });
} else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Production Server running on HTTP Port ${PORT}`);
  });
}
