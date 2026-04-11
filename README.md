# AI Ecommerce Backend

## Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in your .env values
npx prisma generate
npx prisma db push
node src/utils/seed.js
npm start
```

## Default Credentials (after seed)
- **Admin**: admin@aiecommerce.com / Admin@123
- **Customer**: customer@test.com / Customer@123

## API Endpoints

### Auth
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/register | None | Register |
| POST | /api/auth/login | None | Login |
| POST | /api/auth/logout | JWT | Logout |
| GET | /api/auth/me | JWT | Get profile |
| POST | /api/auth/forgot-password | None | Forgot password |
| POST | /api/auth/reset-password/:token | None | Reset password |

### Products
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/products | None | List products |
| GET | /api/products/:id | None | Product detail |
| GET | /api/products/search?q= | None | Search |
| GET | /api/products/categories | None | All categories |

### Cart
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/cart | JWT | Get cart |
| POST | /api/cart/add | JWT | Add item |
| PUT | /api/cart/update | JWT | Update qty |
| DELETE | /api/cart/remove/:id | JWT | Remove item |

### Orders
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/orders/create | JWT | Create order |
| GET | /api/orders/my-orders | JWT | My orders |
| GET | /api/orders/:id | JWT | Order detail |
| POST | /api/orders/:id/cancel | JWT | Cancel order |

### Virtual Try-On
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/vton/try-on | JWT | Submit try-on (multipart) |
| GET | /api/vton/status/:id | JWT | Check status |
| GET | /api/vton/result/:id | JWT | Get result |
| POST | /api/vton/feedback/:id | JWT | Like/dislike |
| GET | /api/vton/history | JWT | Try-on history |

### Recommendations
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/recommendations/trending | None | Trending |
| GET | /api/recommendations/personalized | JWT | Personalized |
| GET | /api/recommendations/similar/:id | None | Similar products |
| GET | /api/recommendations/try-on-based | JWT | Based on likes |

### Admin (requires ADMIN role)
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/admin/dashboard | Dashboard stats |
| GET/POST | /api/admin/products | List/Create products |
| PUT/DELETE | /api/admin/products/:id | Update/Delete |
| GET | /api/admin/orders | All orders |
| PUT | /api/admin/orders/:id/status | Update status |
| GET | /api/admin/users | All users |
| GET | /api/admin/vton-analytics | VTON stats |
| GET | /api/admin/reports | Sales reports |

## Google Colab VTON Setup

1. Open `colab/VITON_HD_Server.ipynb` in Google Colab
2. Run all cells to start the server
3. Copy the ngrok URL
4. Add to `.env`: `COLAB_VTON_URL=https://xxxx.ngrok.io`
