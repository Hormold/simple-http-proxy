#!/bin/bash

# Test setup script for the tunnel server and client

echo "🚀 Setting up tunnel test environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if dependencies are installed
if ! npm list ws > /dev/null 2>&1; then
  print_error "Dependencies not installed. Run: npm install"
  exit 1
fi

# Start test server in background
print_status "Starting test HTTP server on port 3000..."
node test-client.js &
TEST_SERVER_PID=$!

sleep 2

# Check if test server is running
if ! curl -s http://localhost:3000 > /dev/null; then
  print_error "Test server failed to start"
  kill $TEST_SERVER_PID 2>/dev/null
  exit 1
fi

print_status "Test server is running"

# Start tunnel server in background
print_status "Starting tunnel server on port 8080..."
node index.js &
TUNNEL_SERVER_PID=$!

sleep 3

# Check if tunnel server is running
if ! curl -s http://localhost:8080/api/status > /dev/null; then
  print_error "Tunnel server failed to start"
  kill $TEST_SERVER_PID 2>/dev/null
  kill $TUNNEL_SERVER_PID 2>/dev/null
  exit 1
fi

print_status "Tunnel server is running"

# Start tunnel client
SUBDOMAIN="test-$(date +%s)"
print_status "Starting tunnel client with subdomain: $SUBDOMAIN"
node client.js $SUBDOMAIN 3000 &
CLIENT_PID=$!

sleep 2

# Test the tunnel
print_status "Testing tunnel connection..."
PUBLIC_URL="http://$SUBDOMAIN.aimodelproxy.com"

echo "🌐 Public URL: $PUBLIC_URL"
echo "🔗 Local server: http://localhost:3000"
echo ""
echo "📋 Test commands:"
echo "   curl $PUBLIC_URL"
echo "   curl $PUBLIC_URL/api/test"
echo "   curl $PUBLIC_URL/json"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for interrupt
trap "echo -e '\n🛑 Shutting down...'; kill $TEST_SERVER_PID $TUNNEL_SERVER_PID $CLIENT_PID 2>/dev/null; exit 0" INT

# Keep script running
while true; do
  sleep 1
done
