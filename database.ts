import fs from 'fs';
import path from 'path';
import { User, Store, Product, Collection, Order, Review, AiUsageLog } from './src/types';

const DB_FILE = path.join(process.cwd(), 'db.json');

export interface TrafficMetric {
  id: string;
  storeId: string;
  date: string; // YYYY-MM-DD
  visits: number;
  uniqueVisits: number;
  whatsappRedirects: number;
  device: 'mobile' | 'desktop';
  source: 'direct' | 'instagram' | 'tiktok' | 'other';
  productId?: string; // which product was viewed
}

export interface DbSchema {
  users: User[];
  stores: Store[];
  products: Product[];
  collections: Collection[];
  orders: Order[];
  reviews: Review[];
  aiUsageLogs: AiUsageLog[];
  trafficMetrics: TrafficMetric[];
}

function getInitialData(): DbSchema {
  const now = new Date().toISOString();
  
  // Hash isn't strictly required for simple mock, we'll store simple tokens/passwords
  const adminUser: User = {
    id: 'user-admin',
    email: 'admin@vestuai.com.br',
    passwordHash: 'admin123', // demo only — use bcrypt in production
    role: 'superadmin',
    name: 'Super Admin VestuAI',
    phone: '5511999991111',
    createdAt: now,
    updatedAt: now,
    emailVerified: now,
    tourCompleted: true,
  };

  const lojistaUser: User = {
    id: 'user-lojista-1',
    email: 'demo@vestuai.com.br',
    passwordHash: 'demo123', // demo only — use bcrypt in production
    role: 'lojista',
    name: 'Amanda Oliveira',
    phone: '5511999992222',
    createdAt: now,
    updatedAt: now,
    emailVerified: now,
    tourCompleted: false,
  };

  const store: Store = {
    id: 'store-1',
    slug: 'vibechic',
    name: 'Vibe Chic Store',
    ownerName: 'Amanda Oliveira',
    ownerId: 'user-lojista-1',
    email: 'contato@vibechic.com.br',
    phone: '5511999992222',
    physicalAddress: 'Rua Augusta, 1020 - Consolação, São Paulo - SP',
    logoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=200&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1441984969893-c534af968b8b?auto=format&fit=crop&w=1200&q=80',
    templateId: 'clean_minimal',
    primaryColor: '#0a0a0a',
    accentColor: '#6366f1',
    fontFamily: 'Inter',
    status: 'active',
    isPublic: true,
    planId: 'pro',
    planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    customDomain: 'usevibechic.com.br',
    gateEnabled: true,
    gateTitle: 'Identifique-se para Continuar',
    gateSubtitle: 'Selecione seu perfil comercial para visualizarmos os preços recomendados',
    gateRetailLabel: 'Comprar Varejo',
    gateRetailDescription: 'Quero comprar peças únicas para meu uso pessoal sem quantidade mínima.',
    gateWholesaleLabel: 'Comprar Atacado (Lojista)',
    gateWholesaleDescription: 'Preço de revendedor. Mínimo de 3 peças por produto no carrinho.',
    gateWholesaleRequiresLogin: false,
    gateSessionDuration: '24h',
    aiImagesUsedThisWeek: 2,
    aiVideosUsedThisWeek: 0,
    aiUsageResetAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    totalRevenue: 4850.00,
    totalOrders: 12,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  // 6 initial products
  const products: Product[] = [
    {
      id: 'prod-1',
      storeId: 'store-1',
      name: 'Vestido Midi Canelado Sunset',
      description: 'Vestido midi confeccionado em malha canelada de alta qualidade. Possui fenda lateral discreta e caimento perfeito que valoriza a silhueta de forma elegante. Ideal para eventos casuais e saídas à noite.',
      photos: [
        'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80'
      ],
      price: 189.90,
      salePrice: 159.90,
      wholesalePrice: 109.90,
      wholesaleMinQty: 3,
      costPrice: 55.00,
      stock: 35,
      category: 'Vestidos',
      tags: ['canelado', 'midi', 'sunset', 'casual'],
      isFeatured: true,
      isPromotion: true,
      collectionId: 'coll-1',
      status: 'active',
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'prod-2',
      storeId: 'store-1',
      name: 'Blazer Alfaiataria Oversized Lino',
      description: 'Blazer estruturado estilo minimalista oversized confeccionado em mescla de linho e algodão orgânico. Possui ombreiras sutis e bolsos embutidos. Uma peça atemporal para elevar qualquer look básico.',
      photos: [
        'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=600&q=80'
      ],
      price: 299.90,
      salePrice: null,
      wholesalePrice: 179.90,
      wholesaleMinQty: 2,
      costPrice: 90.00,
      stock: 12,
      category: 'Tops',
      tags: ['blazer', 'alfaiataria', 'oversized', 'linho'],
      isFeatured: true,
      isPromotion: false,
      collectionId: 'coll-1',
      status: 'active',
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'prod-3',
      storeId: 'store-1',
      name: 'Calça Wide Leg Denim Raw',
      description: 'Calça jeans modelagem wide leg com cintura alta e lavagem raw escura clássica. Confeccionada em 100% algodão de alta gramatura, ideal para garantir estrutura e conforto ao vestir.',
      photos: [
        'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=80'
      ],
      price: 219.90,
      salePrice: null,
      wholesalePrice: 129.90,
      wholesaleMinQty: 3,
      costPrice: 65.00,
      stock: 24,
      category: 'Calças',
      tags: ['jeans', 'wide leg', 'denim', 'cintura alta'],
      isFeatured: true,
      isPromotion: false,
      collectionId: 'coll-2',
      status: 'active',
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'prod-4',
      storeId: 'store-1',
      name: 'Cropped Tricô Premium Soft',
      description: 'Cropped regata de tricô trançado premium, super macio ao toque e com excelente elasticidade. Possui decote quadrado elegante e acabamento canelado na barra.',
      photos: [
        'https://images.unsplash.com/photo-1574164904299-3a102b110380?auto=format&fit=crop&w=600&q=80'
      ],
      price: 99.90,
      salePrice: 79.90,
      wholesalePrice: 49.90,
      wholesaleMinQty: 4,
      costPrice: 22.00,
      stock: 45,
      category: 'Blusas',
      tags: ['trico', 'cropped', 'regata', 'basic'],
      isFeatured: false,
      isPromotion: true,
      collectionId: 'coll-2',
      status: 'active',
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'prod-5',
      storeId: 'store-1',
      name: 'Conjunto Moletom Cozy Cream',
      description: 'Conjunto composto de blusa de moletom oversized gola redonda e calça jogger com regulador interno. Na charmosa cor off-white amendoado, com interior flanelado para o máximo aconchego em dias frios.',
      photos: [
        'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80'
      ],
      price: 249.90,
      salePrice: null,
      wholesalePrice: 159.90,
      wholesaleMinQty: 2,
      costPrice: 85.00,
      stock: 15,
      category: 'Conjuntos',
      tags: ['moletom', 'cozy', 'cream', 'inverno', 'conjunto'],
      isFeatured: false,
      isPromotion: false,
      collectionId: 'coll-1',
      status: 'active',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'prod-6',
      storeId: 'store-1',
      name: 'Camisa Oversized Linho Pura',
      description: 'Camisa de botões oversized confeccionada inteiramente em fibra natural de linho. Mangas longas ajustáveis, bolso frontal e gola clássica estruturada. Frescor elegante para os dias quentes.',
      photos: [
        'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=600&q=80'
      ],
      price: 199.90,
      salePrice: null,
      wholesalePrice: 119.90,
      wholesaleMinQty: 3,
      costPrice: 50.00,
      stock: 20,
      category: 'Blusas',
      tags: ['camisa', 'linho', 'oversized', 'fresco'],
      isFeatured: false,
      isPromotion: false,
      collectionId: null,
      status: 'active',
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    }
  ];

  const collections: Collection[] = [
    {
      id: 'coll-1',
      storeId: 'store-1',
      name: 'Coleção de Outono/Inverno',
      description: 'Peças aconchegantes e elegantes inspiradas na sofisticação urbana.',
      coverImageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=600&q=80',
      productIds: ['prod-1', 'prod-2', 'prod-5'],
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'coll-2',
      storeId: 'store-1',
      name: 'Básicos Essenciais',
      description: 'Modelos versáteis para compor o seu guarda-roupa inteligente.',
      coverImageUrl: 'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=600&q=80',
      productIds: ['prod-3', 'prod-4'],
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  // Past reviews
  const reviews: Review[] = [
    {
      id: 'rev-1',
      storeId: 'store-1',
      productId: 'prod-1',
      customerName: 'Juliana Siqueira',
      rating: 5,
      comment: 'Fascinada com a qualidade deste vestido! Veste super bem e o tecido é mega encorpado.',
      isApproved: true,
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'rev-2',
      storeId: 'store-1',
      productId: 'prod-2',
      customerName: 'Mariana Lima',
      rating: 5,
      comment: 'O blazer oversized perfeito! Estilo despojado e tecido natural maravilhoso.',
      isApproved: true,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'rev-3',
      storeId: 'store-1',
      productId: 'prod-3',
      customerName: 'Roberta Dias',
      rating: 4,
      comment: 'Calça linda, jeans grosso de vergonha. Ficou um tiquinho comprida na barra, mas nada que uma costureira não resolva.',
      isApproved: true,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    }
  ];

  // 12 Orders
  const orders: Order[] = [
    {
      id: 'ord-1',
      storeId: 'store-1',
      customerName: 'Aline Santos',
      customerPhone: '5511988887766',
      items: [
        { productId: 'prod-1', productName: 'Vestido Midi Canelado Sunset', quantity: 1, price: 159.90 }
      ],
      totalAmount: 159.90,
      platformFee: 7.99, // 5% standard pro fee
      status: 'completed',
      whatsappRedirectedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'ord-2',
      storeId: 'store-1',
      customerName: 'Karina de Souza',
      customerPhone: '5511977776655',
      items: [
        { productId: 'prod-2', productName: 'Blazer Alfaiataria Oversized Lino', quantity: 1, price: 299.90 },
        { productId: 'prod-3', productName: 'Calça Wide Leg Denim Raw', quantity: 1, price: 219.90 }
      ],
      totalAmount: 519.80,
      platformFee: 25.99,
      status: 'completed',
      whatsappRedirectedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'ord-3',
      storeId: 'store-1',
      customerName: 'Fernanda L. (Atacado)',
      customerPhone: '5521998884433',
      items: [
        { productId: 'prod-1', productName: 'Vestido Midi Canelado Sunset', quantity: 5, price: 109.90 },
        { productId: 'prod-4', productName: 'Cropped Tricô Premium Soft', quantity: 10, price: 49.90 }
      ],
      totalAmount: 1048.50,
      platformFee: 52.42,
      status: 'completed',
      whatsappRedirectedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'ord-4',
      storeId: 'store-1',
      customerName: 'Letícia Albuquerque',
      customerPhone: '5531987654321',
      items: [
        { productId: 'prod-5', productName: 'Conjunto Moletom Cozy Cream', quantity: 2, price: 249.90 }
      ],
      totalAmount: 499.80,
      platformFee: 24.99,
      status: 'completed',
      whatsappRedirectedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  // Traffic analytics metrics for past 30 days
  const trafficMetrics: TrafficMetric[] = [];
  const sources: ('direct' | 'instagram' | 'tiktok' | 'other')[] = ['direct', 'instagram', 'tiktok', 'other'];
  const devices: ('mobile' | 'desktop')[] = ['mobile', 'desktop'];
  
  for (let i = 29; i >= 0; i--) {
    const dateStr = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Random but realistic visits
    const visits = Math.floor(45 + Math.random() * 80);
    const uniqueVisits = Math.floor(visits * 0.75);
    const redirects = Math.floor(visits * (0.05 + Math.random() * 0.08));

    trafficMetrics.push({
      id: `m-${dateStr}`,
      storeId: 'store-1',
      date: dateStr,
      visits,
      uniqueVisits,
      whatsappRedirects: redirects,
      device: devices[Math.floor(Math.random() * devices.length)],
      source: sources[Math.floor(Math.random() * sources.length)],
    });
  }

  return {
    users: [adminUser, lojistaUser],
    stores: [store],
    products: products,
    collections: collections,
    orders: orders,
    reviews: reviews,
    aiUsageLogs: [],
    trafficMetrics: trafficMetrics
  };
}

export class DB {
  private static data: DbSchema | null = null;

  public static load(): DbSchema {
    // Always read from disk — prevents stale in-memory cache issues
    // (acceptable for a file-based dev DB; swap for Redis/Postgres in production)
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent) as DbSchema;
        return this.data;
      }
    } catch (e) {
      console.error("Error reading db.json, seeding defaults", e);
    }

    this.data = getInitialData();
    this.save();
    return this.data;
  }

  public static save(): void {
    if (!this.data) return;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error("Error writing db.json", e);
    }
  }

  // Clear or re-seed
  public static reset(): void {
    this.data = getInitialData();
    this.save();
  }
}
