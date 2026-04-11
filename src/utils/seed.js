// src/utils/seed.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const categories = ['Shirts', 'Pants', 'Dresses', 'Jackets', 'Kurtas', 'Abayas', 'T-Shirts', 'Jeans'];

const sampleProducts = [
  {
    name: 'Classic White Oxford Shirt',
    description: 'A timeless white Oxford shirt crafted from premium 100% cotton. Perfect for formal and semi-formal occasions with a crisp, clean look.',
    price: 2499, comparePrice: 3500,
    category: 'Shirts', subCategory: 'Formal', brand: 'StylePK',
    colors: ['White', 'Light Blue', 'Grey'],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    material: 'Cotton', pattern: 'Solid', stock: 50,
    tags: ['formal', 'classic', 'office', 'cotton'],
    images: [
      { url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600', alt: 'White Oxford Shirt' },
      { url: 'https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?w=600', alt: 'White Oxford Shirt Back' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600',
    rating: 4.5, numReviews: 128, popularity: 450
  },
  {
    name: 'Slim Fit Dark Jeans',
    description: 'Premium dark wash slim fit jeans with a modern silhouette. Made from stretch denim for maximum comfort throughout the day.',
    price: 3200, comparePrice: 4500,
    category: 'Jeans', subCategory: 'Slim Fit', brand: 'DenimCraft',
    colors: ['Dark Blue', 'Black', 'Indigo'],
    sizes: ['28', '30', '32', '34', '36'],
    material: 'Denim', pattern: 'Solid', stock: 35,
    tags: ['casual', 'denim', 'slim', 'jeans'],
    images: [
      { url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600', alt: 'Dark Jeans' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600',
    rating: 4.3, numReviews: 89, popularity: 380
  },
  {
    name: 'Embroidered Lawn Kurta',
    description: 'Beautifully embroidered summer lawn kurta with traditional Pakistani motifs. Lightweight and breathable for hot weather.',
    price: 1850, comparePrice: 2500,
    category: 'Kurtas', subCategory: 'Summer', brand: 'PakFashion',
    colors: ['White', 'Mint', 'Powder Blue', 'Peach'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    material: 'Lawn', pattern: 'Embroidered', stock: 75,
    tags: ['traditional', 'pakistani', 'summer', 'lawn', 'embroidered'],
    images: [
      { url: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=600', alt: 'Embroidered Kurta' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=600',
    rating: 4.7, numReviews: 210, popularity: 620
  },
  {
    name: 'Black Abaya with Lace Detail',
    description: 'Elegant black abaya featuring delicate lace detailing on sleeves and hemline. Premium nida fabric with a luxurious drape.',
    price: 4500, comparePrice: 6000,
    category: 'Abayas', subCategory: 'Formal', brand: 'ModestWear',
    colors: ['Black', 'Navy', 'Maroon'],
    sizes: ['54', '56', '58', '60', '62'],
    material: 'Nida', pattern: 'Lace', stock: 30,
    tags: ['abaya', 'modest', 'formal', 'black', 'lace'],
    images: [
      { url: 'https://images.unsplash.com/photo-1581338834647-b0fb40704e21?w=600', alt: 'Black Abaya' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1581338834647-b0fb40704e21?w=600',
    rating: 4.8, numReviews: 156, popularity: 540
  },
  {
    name: 'Graphic Print T-Shirt',
    description: 'Comfortable 100% cotton graphic t-shirt with modern street art print. Relaxed fit perfect for casual everyday wear.',
    price: 899, comparePrice: 1200,
    category: 'T-Shirts', subCategory: 'Casual', brand: 'UrbanTee',
    colors: ['Black', 'White', 'Charcoal', 'Navy'],
    sizes: ['S', 'M', 'L', 'XL'],
    material: 'Cotton', pattern: 'Graphic', stock: 100,
    tags: ['casual', 'graphic', 'tshirt', 'streetwear'],
    images: [
      { url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600', alt: 'Graphic T-Shirt' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600',
    rating: 4.2, numReviews: 340, popularity: 890
  },
  {
    name: 'Formal Blazer - Charcoal',
    description: 'Sharp charcoal grey blazer with a slim modern cut. Ideal for office wear, presentations, and formal events.',
    price: 8500, comparePrice: 12000,
    category: 'Jackets', subCategory: 'Blazers', brand: 'Executive',
    colors: ['Charcoal', 'Navy', 'Black'],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    material: 'Polyester Blend', pattern: 'Solid', stock: 20,
    tags: ['formal', 'blazer', 'office', 'smart'],
    images: [
      { url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600', alt: 'Charcoal Blazer' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=600',
    rating: 4.6, numReviews: 67, popularity: 290
  },
  {
    name: 'Summer Floral Dress',
    description: 'Vibrant floral print summer dress with flutter sleeves and A-line silhouette. Light and airy fabric perfect for warm days.',
    price: 2800, comparePrice: 3800,
    category: 'Dresses', subCategory: 'Casual', brand: 'BloomWear',
    colors: ['Floral Blue', 'Floral Pink', 'Floral Yellow'],
    sizes: ['XS', 'S', 'M', 'L'],
    material: 'Chiffon', pattern: 'Floral', stock: 45,
    tags: ['casual', 'floral', 'summer', 'dress', 'feminine'],
    images: [
      { url: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600', alt: 'Floral Dress' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600',
    rating: 4.4, numReviews: 92, popularity: 410
  },
  {
    name: 'Chino Trousers - Khaki',
    description: 'Classic khaki chino trousers with a straight leg fit. Versatile style transitions seamlessly from casual to smart-casual.',
    price: 2200, comparePrice: 3000,
    category: 'Pants', subCategory: 'Chinos', brand: 'StylePK',
    colors: ['Khaki', 'Beige', 'Olive', 'Navy'],
    sizes: ['28', '30', '32', '34', '36', '38'],
    material: 'Cotton Twill', pattern: 'Solid', stock: 60,
    tags: ['casual', 'chino', 'pants', 'versatile'],
    images: [
      { url: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600', alt: 'Khaki Chinos' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600',
    rating: 4.1, numReviews: 145, popularity: 330
  },
  {
    name: 'Printed Khaddar Shalwar Kameez',
    description: 'Warm khaddar fabric shalwar kameez set with geometric block print. Includes matching shalwar and dupatta.',
    price: 3200, comparePrice: 4200,
    category: 'Kurtas', subCategory: 'Winter', brand: 'PakFashion',
    colors: ['Rust', 'Teal', 'Burgundy', 'Forest Green'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    material: 'Khaddar', pattern: 'Block Print', stock: 40,
    tags: ['winter', 'traditional', 'khaddar', 'block print', 'set'],
    images: [
      { url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600', alt: 'Khaddar Kurta' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600',
    rating: 4.9, numReviews: 278, popularity: 720
  },
  {
    name: 'Denim Jacket - Classic Blue',
    description: 'Iconic classic blue denim jacket with button closure and chest pockets. A wardrobe staple that never goes out of style.',
    price: 5500, comparePrice: 7000,
    category: 'Jackets', subCategory: 'Denim', brand: 'DenimCraft',
    colors: ['Classic Blue', 'Light Blue', 'Black'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    material: 'Denim', pattern: 'Solid', stock: 25,
    tags: ['casual', 'denim', 'jacket', 'classic'],
    images: [
      { url: 'https://images.unsplash.com/photo-1551537482-f2075a1d41f2?w=600', alt: 'Denim Jacket' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1551537482-f2075a1d41f2?w=600',
    rating: 4.5, numReviews: 113, popularity: 490
  },
  {
    name: 'Maxi Dress - Bohemian',
    description: 'Free-flowing bohemian maxi dress with intricate paisley pattern. Perfect for festivals, beach outings, and casual outings.',
    price: 3500, comparePrice: 4800,
    category: 'Dresses', subCategory: 'Maxi', brand: 'BloomWear',
    colors: ['Terracotta', 'Cobalt Blue', 'Sage Green'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    material: 'Rayon', pattern: 'Paisley', stock: 30,
    tags: ['bohemian', 'maxi', 'casual', 'printed', 'summer'],
    images: [
      { url: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600', alt: 'Bohemian Maxi Dress' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600',
    rating: 4.3, numReviews: 88, popularity: 360
  },
  {
    name: 'Polo Shirt - Navy Blue',
    description: 'Classic navy blue polo shirt in premium pique cotton. Smart casual essential for a polished everyday look.',
    price: 1650, comparePrice: 2200,
    category: 'T-Shirts', subCategory: 'Polo', brand: 'UrbanTee',
    colors: ['Navy', 'Black', 'White', 'Burgundy', 'Forest Green'],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    material: 'Pique Cotton', pattern: 'Solid', stock: 80,
    tags: ['polo', 'smart casual', 'office casual', 'cotton'],
    images: [
      { url: 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=600', alt: 'Navy Polo Shirt' }
    ],
    garmentImageUrl: 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=600',
    rating: 4.4, numReviews: 195, popularity: 560
  }
];

async function seed() {
  console.log('🌱 Starting database seed...');

  try {
    // Create admin user
    const adminPassword = await bcrypt.hash('Admin@123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@aiecommerce.com' },
      update: {},
      create: {
        name: 'Admin User',
        email: 'admin@aiecommerce.com',
        password: adminPassword,
        role: 'ADMIN',
        isVerified: true
      }
    });
    console.log('✅ Admin created:', admin.email);

    // Create test customer
    const customerPassword = await bcrypt.hash('Customer@123', 10);
    const customer = await prisma.user.upsert({
      where: { email: 'customer@test.com' },
      update: {},
      create: {
        name: 'Test Customer',
        email: 'customer@test.com',
        password: customerPassword,
        role: 'CUSTOMER',
        isVerified: true
      }
    });

    // Create cart for customer
    await prisma.cart.upsert({
      where: { userId: customer.id },
      update: {},
      create: { userId: customer.id }
    });

    console.log('✅ Test customer created:', customer.email);

    // Create products
    for (const productData of sampleProducts) {
      const existing = await prisma.product.findFirst({ where: { name: productData.name } });
      if (!existing) {
        await prisma.product.create({
          data: { ...productData, imageEmbedding: [], textEmbedding: [] }
        });
        process.stdout.write('.');
      }
    }

    console.log('\n✅ Sample products created');
    console.log('\n🎉 Seed completed successfully!');
    console.log('\nCredentials:');
    console.log('  Admin: admin@aiecommerce.com / Admin@123');
    console.log('  Customer: customer@test.com / Customer@123');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed();
