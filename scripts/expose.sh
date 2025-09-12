#!/bin/bash

# Script to expose your E-Home project to the public using localtunnel
# This will create tunnels for both frontend and backend

echo "🚀 Setting up public tunnels for E-Home project..."

# Check if localtunnel is installed
if ! command -v lt &> /dev/null; then
    echo "❌ Localtunnel is not installed. Installing now..."
    npm install -g localtunnel
fi

# Check if frontend is running
if ! curl -s http://localhost:5173 > /dev/null; then
    echo "❌ Frontend is not running on port 5173. Please start it first:"
    echo "   cd frontend && npm run dev"
    exit 1
fi

# Check if backend is running
if ! curl -s http://localhost:8000 > /dev/null; then
    echo "❌ Backend is not running on port 8000. Please start it first:"
    echo "   python main.py"
    exit 1
fi

echo "✅ Both frontend and backend are running!"

# Create tunnels
echo "🌐 Creating tunnels..."

# Frontend tunnel
echo "📱 Frontend tunnel (for mobile access):"
lt --port 5173 --subdomain e-home-frontend &
FRONTEND_PID=$!

# Backend tunnel  
echo "🔧 Backend tunnel (for API access):"
lt --port 8000 --subdomain e-home-backend &
BACKEND_PID=$!

# Wait a moment for tunnels to establish
sleep 3

echo ""
echo "🎉 Tunnels created successfully!"
echo ""
echo "📱 Frontend URL: https://e-home-frontend.loca.lt"
echo "🔧 Backend URL: https://e-home-backend.loca.lt"
echo ""
echo "📱 Open the frontend URL on your mobile phone to test!"
echo ""
echo "⚠️  Note: You'll need to click 'Click to continue' on the first visit"
echo "⚠️  The tunnels will stay active as long as this script is running"
echo ""
echo "Press Ctrl+C to stop the tunnels"

# Keep the script running
wait


