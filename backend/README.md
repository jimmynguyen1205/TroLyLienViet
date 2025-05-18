# Tro Ly Lien Viet

Backend service for Tro Ly Lien Viet application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with the following variables:
```env
PORT=3000
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=3600
```

3. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication
- POST `/auth/login` - User login
- POST `/auth/register` - User registration

### Chat
- POST `/chat` - Chat with AI assistant (requires authentication) 