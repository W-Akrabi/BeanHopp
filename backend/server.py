from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import base64
import json
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import stripe

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def get_jwt_role(token: str) -> Optional[str]:
    """Decode JWT payload without verification to inspect the role claim."""
    try:
        payload_b64 = token.split('.')[1]
        padding = '=' * (-len(payload_b64) % 4)
        payload_json = base64.urlsafe_b64decode(payload_b64 + padding).decode('utf-8')
        payload = json.loads(payload_json)
        return payload.get('role')
    except Exception:
        return None

# Supabase connection
supabase_url = os.environ.get('SUPABASE_URL', '')
supabase_service_role_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
supabase_legacy_key = os.environ.get('SUPABASE_KEY', '')
supabase_key = supabase_service_role_key or supabase_legacy_key
supabase: Client = create_client(supabase_url, supabase_key)

if not supabase_service_role_key:
    logger.warning("SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to SUPABASE_KEY.")

supabase_key_role = get_jwt_role(supabase_key) if supabase_key else None
if supabase_key_role == 'anon':
    logger.warning(
        "Backend Supabase key role is 'anon'. RLS-protected writes (e.g., wallets inserts/updates) may fail."
    )

# Stripe configuration
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY', 'pk_test_51RglLGP6K8lIhnBJiqdFrOAZawOhieG39W2KhpAIk6uW2WHVsPteZDb8pfOrRZMWXhhdr0w1qnf869s66aA2BgbJ00OAEQMk0l')

# Create the main app
app = FastAPI(title="BeanHop API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============== Models ==============

class ShopCreate(BaseModel):
    name: str
    description: Optional[str] = None
    address: str
    city: str = "Toronto"
    latitude: float = 43.6510
    longitude: float = -79.3835
    phone: Optional[str] = None
    email: Optional[str] = None
    hours: Optional[Dict[str, Dict[str, str]]] = None
    rating: float = 0.0
    rating_count: int = 0
    is_active: bool = True
    loyalty_multiplier: float = 1.0

class MenuItemCreate(BaseModel):
    shop_id: str
    name: str
    description: Optional[str] = None
    category: str
    base_price: float
    image_url: Optional[str] = None
    customization_options: Optional[Dict[str, List[str]]] = None
    is_available: bool = True
    is_featured: bool = False
    sort_order: int = 0

class OrderItem(BaseModel):
    menu_item_id: str
    name: str
    price: float
    quantity: int
    customizations: Dict[str, str] = {}

class OrderCreate(BaseModel):
    user_id: str
    shop_id: str
    items: List[OrderItem]
    subtotal: float
    tax: float
    total: float
    pickup_time: Optional[str] = None
    special_instructions: Optional[str] = None

# ============== Helper Functions ==============

def calculate_loyalty_level(points: int) -> str:
    if points >= 2000:
        return "Platinum"
    elif points >= 500:
        return "Gold"
    elif points >= 100:
        return "Silver"
    return "Bronze"

def generate_order_number() -> str:
    return f"ORD-{uuid.uuid4().hex[:6].upper()}"

def find_stripe_customer(user_id: str, email: Optional[str] = None):
    """Find an existing Stripe customer for this app user."""
    if not stripe.api_key:
        return None

    # Prefer metadata lookup by app user id.
    try:
        search_result = stripe.Customer.search(
            query=f"metadata['user_id']:'{user_id}'",
            limit=1
        )
        if search_result.data:
            return search_result.data[0]
    except Exception as e:
        logger.warning(f"Stripe customer search unavailable, falling back to email lookup: {e}")

    if email:
        try:
            customers = stripe.Customer.list(email=email, limit=10)
            for customer in customers.data:
                metadata = customer.get('metadata') or {}
                if metadata.get('user_id') == user_id:
                    return customer
        except Exception as e:
            logger.warning(f"Stripe customer email lookup failed: {e}")
    else:
        # Fallback for environments where Customer.search is unavailable.
        try:
            customers = stripe.Customer.list(limit=100)
            for customer in customers.data:
                metadata = customer.get('metadata') or {}
                if metadata.get('user_id') == user_id:
                    return customer
        except Exception as e:
            logger.warning(f"Stripe customer list fallback failed: {e}")

    return None

def get_or_create_stripe_customer(user_id: str, email: Optional[str] = None):
    """Get a Stripe customer for the user, creating one if missing."""
    customer = find_stripe_customer(user_id, email=email)
    if customer:
        return customer

    return stripe.Customer.create(
        email=email,
        metadata={"user_id": user_id}
    )

# ============== API Routes ==============

@api_router.get("/")
async def root():
    return {"message": "Welcome to BeanHop API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ------------ Shops ------------

@api_router.get("/shops")
async def get_shops(city: Optional[str] = None, is_active: bool = True):
    """Get all shops, optionally filtered by city"""
    try:
        query = supabase.table('shops').select('*').eq('is_active', is_active)
        if city:
            query = query.eq('city', city)
        
        response = query.execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching shops: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/shops/{shop_id}")
async def get_shop(shop_id: str):
    """Get a single shop by ID"""
    try:
        response = supabase.table('shops').select('*').eq('id', shop_id).single().execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching shop: {e}")
        raise HTTPException(status_code=404, detail="Shop not found")

@api_router.post("/shops")
async def create_shop(shop_data: ShopCreate):
    """Create a new shop"""
    try:
        shop_dict = shop_data.dict()
        shop_dict['id'] = str(uuid.uuid4())
        shop_dict['created_at'] = datetime.utcnow().isoformat()
        
        response = supabase.table('shops').insert(shop_dict).execute()
        return response.data[0]
    except Exception as e:
        logger.error(f"Error creating shop: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/shops/{shop_id}/menu")
async def get_shop_menu(shop_id: str, category: Optional[str] = None):
    """Get menu items for a shop"""
    try:
        query = supabase.table('menu_items').select('*').eq('shop_id', shop_id).eq('is_available', True)
        if category:
            query = query.eq('category', category)
        
        response = query.order('sort_order').execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching menu: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Menu Items ------------

@api_router.get("/menu-items/{item_id}")
async def get_menu_item(item_id: str):
    """Get a single menu item by ID"""
    try:
        response = supabase.table('menu_items').select('*').eq('id', item_id).single().execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching menu item: {e}")
        raise HTTPException(status_code=404, detail="Menu item not found")

@api_router.post("/menu-items")
async def create_menu_item(item_data: MenuItemCreate):
    """Create a new menu item"""
    try:
        item_dict = item_data.dict()
        item_dict['id'] = str(uuid.uuid4())
        item_dict['created_at'] = datetime.utcnow().isoformat()
        
        response = supabase.table('menu_items').insert(item_dict).execute()
        return response.data[0]
    except Exception as e:
        logger.error(f"Error creating menu item: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Stripe Payments ------------

class PaymentIntentRequest(BaseModel):
    amount: float  # Amount in dollars
    order_id: Optional[str] = None
    user_id: Optional[str] = None
    email: Optional[str] = None
    purpose: str = "order"
    save_payment_method: bool = True
    preferred_payment_method_id: Optional[str] = None

class PaymentMethodSetupRequest(BaseModel):
    user_id: str
    email: Optional[str] = None

class SavedPaymentChargeRequest(BaseModel):
    amount: float
    user_id: str
    payment_method_id: str
    order_id: Optional[str] = None
    email: Optional[str] = None
    purpose: str = "order"

@api_router.get("/stripe/config")
async def get_stripe_config():
    """Get Stripe publishable key for frontend"""
    return {"publishableKey": STRIPE_PUBLISHABLE_KEY}

@api_router.post("/stripe/create-payment-intent")
async def create_payment_intent(request: PaymentIntentRequest):
    """Create a Stripe PaymentIntent"""
    try:
        if request.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")

        # Convert dollars to cents
        amount_cents = int(round(request.amount * 100))
        
        if not stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe is not configured on the server")
        
        metadata = {
            "purpose": request.purpose,
        }
        if request.order_id:
            metadata["order_id"] = request.order_id
        if request.user_id:
            metadata["user_id"] = request.user_id

        payment_intent_params: Dict[str, Any] = {
            "amount": amount_cents,
            "currency": "cad",
            "automatic_payment_methods": {"enabled": True},
            "metadata": metadata,
        }

        customer_id = None
        if request.user_id:
            customer = get_or_create_stripe_customer(request.user_id, email=request.email)
            customer_id = customer.id
            payment_intent_params["customer"] = customer_id

            if request.preferred_payment_method_id:
                payment_method = stripe.PaymentMethod.retrieve(request.preferred_payment_method_id)
                if payment_method.customer != customer_id:
                    raise HTTPException(status_code=400, detail="Selected payment method does not belong to user")

                stripe.Customer.modify(
                    customer_id,
                    invoice_settings={"default_payment_method": request.preferred_payment_method_id}
                )
                metadata["preferred_payment_method_id"] = request.preferred_payment_method_id

            if request.save_payment_method:
                payment_intent_params["setup_future_usage"] = "off_session"

        # Create real payment intent
        payment_intent = stripe.PaymentIntent.create(**payment_intent_params)
        
        return {
            "clientSecret": payment_intent.client_secret,
            "paymentIntentId": payment_intent.id,
            "amount": amount_cents,
            "currency": "cad",
            "customerId": customer_id,
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating payment intent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/stripe/confirm-payment")
async def confirm_payment(payment_intent_id: str, order_id: str):
    """Confirm payment was successful and update order"""
    try:
        if stripe.api_key:
            payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
            if payment_intent.status != 'succeeded':
                raise HTTPException(status_code=400, detail="Payment is not completed")

            metadata_order_id = (payment_intent.metadata or {}).get('order_id')
            if metadata_order_id and metadata_order_id != order_id:
                raise HTTPException(status_code=400, detail="Payment intent does not match order")

            if payment_intent.customer and payment_intent.payment_method:
                stripe.Customer.modify(
                    payment_intent.customer,
                    invoice_settings={"default_payment_method": payment_intent.payment_method}
                )

        # Update order with payment info and status
        response = supabase.table('orders').update({
            'stripe_payment_id': payment_intent_id,
            'status': 'confirmed',
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', order_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Order not found")
        
        return {"success": True, "order": response.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/payments/methods/{user_id}")
async def get_saved_payment_methods(user_id: str, email: Optional[str] = None):
    """Get user's saved card payment methods from Stripe."""
    try:
        if not stripe.api_key:
            return {"customer_id": None, "payment_methods": []}

        customer = find_stripe_customer(user_id, email=email)
        if not customer:
            return {"customer_id": None, "payment_methods": []}

        customer_id = customer.id
        default_payment_method_id = (customer.get('invoice_settings') or {}).get('default_payment_method')
        payment_methods = stripe.PaymentMethod.list(
            customer=customer_id,
            type='card',
            limit=20
        )

        results = []
        for payment_method in payment_methods.data:
            card = payment_method.get('card') or {}
            results.append({
                "id": payment_method.id,
                "brand": card.get('brand'),
                "last4": card.get('last4'),
                "exp_month": card.get('exp_month'),
                "exp_year": card.get('exp_year'),
                "is_default": payment_method.id == default_payment_method_id,
            })

        return {
            "customer_id": customer_id,
            "payment_methods": results,
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error fetching payment methods: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching payment methods: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/payments/setup-intent")
async def create_payment_method_setup_intent(request: PaymentMethodSetupRequest):
    """Create a Stripe SetupIntent so user can add/save a card."""
    try:
        if not stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe is not configured on the server")

        customer = get_or_create_stripe_customer(request.user_id, email=request.email)
        setup_intent = stripe.SetupIntent.create(
            customer=customer.id,
            automatic_payment_methods={"enabled": True},
            usage="off_session",
            metadata={"user_id": request.user_id, "purpose": "save_payment_method"},
        )

        return {
            "clientSecret": setup_intent.client_secret,
            "setupIntentId": setup_intent.id,
            "customerId": customer.id,
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating setup intent: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating payment method setup intent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/stripe/pay-with-saved-method")
async def pay_with_saved_method(request: SavedPaymentChargeRequest):
    """Charge a user's saved card without showing card-entry PaymentSheet."""
    try:
        if request.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")

        if not stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe is not configured on the server")

        amount_cents = int(round(request.amount * 100))
        if amount_cents <= 0:
            raise HTTPException(status_code=400, detail="Invalid amount")

        customer = get_or_create_stripe_customer(request.user_id, email=request.email)
        payment_method = stripe.PaymentMethod.retrieve(request.payment_method_id)
        if payment_method.customer != customer.id:
            raise HTTPException(status_code=400, detail="Selected payment method does not belong to user")

        stripe.Customer.modify(
            customer.id,
            invoice_settings={"default_payment_method": request.payment_method_id}
        )

        metadata = {
            "purpose": request.purpose,
            "user_id": request.user_id,
            "payment_method_id": request.payment_method_id,
        }
        if request.order_id:
            metadata["order_id"] = request.order_id

        payment_intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="cad",
            customer=customer.id,
            payment_method=request.payment_method_id,
            confirm=True,
            off_session=True,
            metadata=metadata,
        )

        if payment_intent.status != "succeeded":
            raise HTTPException(status_code=400, detail=f"Payment not completed: {payment_intent.status}")

        return {
            "success": True,
            "paymentIntentId": payment_intent.id,
            "status": payment_intent.status,
            "amount": amount_cents,
            "currency": payment_intent.currency,
        }
    except HTTPException:
        raise
    except stripe.error.CardError as e:
        logger.error(f"Card error charging saved method: {e}")
        raise HTTPException(status_code=402, detail=getattr(e, "user_message", str(e)))
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error charging saved method: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error charging saved payment method: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Orders ------------

@api_router.get("/orders")
async def get_orders(user_id: Optional[str] = None, status: Optional[str] = None):
    """Get orders, optionally filtered by user or status"""
    try:
        query = supabase.table('orders').select('*')
        if user_id:
            query = query.eq('user_id', user_id)
        if status:
            query = query.eq('status', status)
        
        response = query.order('created_at', desc=True).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str):
    """Get a single order by ID"""
    try:
        response = supabase.table('orders').select('*').eq('id', order_id).single().execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching order: {e}")
        raise HTTPException(status_code=404, detail="Order not found")

@api_router.post("/orders")
async def create_order(order_data: OrderCreate):
    """Create a new order"""
    try:
        # Get shop name
        shop_response = supabase.table('shops').select('name').eq('id', order_data.shop_id).single().execute()
        shop_name = shop_response.data.get('name', 'Unknown Shop') if shop_response.data else 'Unknown Shop'
        
        # Calculate points earned (1 point per dollar)
        points_earned = int(order_data.subtotal)
        
        order_dict = order_data.dict()
        order_dict['id'] = str(uuid.uuid4())
        order_dict['order_number'] = generate_order_number()
        order_dict['shop_name'] = shop_name
        order_dict['status'] = 'pending'
        order_dict['points_earned'] = points_earned
        order_dict['discount'] = 0.0
        order_dict['created_at'] = datetime.utcnow().isoformat()
        order_dict['updated_at'] = datetime.utcnow().isoformat()
        
        # Convert items to JSON-serializable format
        order_dict['items'] = [item.dict() for item in order_data.items]
        
        response = supabase.table('orders').insert(order_dict).execute()
        
        # Create loyalty transaction
        if points_earned > 0:
            loyalty_tx = {
                'id': str(uuid.uuid4()),
                'user_id': order_data.user_id,
                'shop_id': order_data.shop_id,
                'order_id': order_dict['id'],
                'points_change': points_earned,
                'transaction_type': 'earn',
                'description': f"Order #{order_dict['order_number']}",
                'created_at': datetime.utcnow().isoformat()
            }
            supabase.table('loyalty_transactions').insert(loyalty_tx).execute()
        
        return response.data[0]
    except Exception as e:
        logger.error(f"Error creating order: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str):
    """Update order status"""
    valid_statuses = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    try:
        response = supabase.table('orders').update({
            'status': status,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('id', order_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Order not found")
        
        return {"message": "Order status updated", "status": status}
    except Exception as e:
        logger.error(f"Error updating order status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Loyalty ------------

@api_router.get("/loyalty/{user_id}/points")
async def get_user_points(user_id: str):
    """Get total points for a user"""
    try:
        response = supabase.table('loyalty_transactions').select('points_change').eq('user_id', user_id).execute()
        
        total_points = sum(tx['points_change'] for tx in response.data) if response.data else 0
        
        return {
            "user_id": user_id,
            "total_points": total_points,
            "loyalty_level": calculate_loyalty_level(total_points)
        }
    except Exception as e:
        logger.error(f"Error fetching user points: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/loyalty/{user_id}/transactions")
async def get_loyalty_transactions(user_id: str, limit: int = 50):
    """Get loyalty transaction history for a user"""
    try:
        response = supabase.table('loyalty_transactions').select('*').eq('user_id', user_id).order('created_at', desc=True).limit(limit).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error fetching loyalty transactions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Wallet ------------

class WalletTopUpRequest(BaseModel):
    user_id: str
    amount: float
    payment_intent_id: str

class WalletTopUpIntentRequest(BaseModel):
    user_id: str
    amount: float
    email: Optional[str] = None

class RedeemRewardRequest(BaseModel):
    user_id: str
    reward_type: str  # 'free_drink', 'size_upgrade', 'free_pastry'
    points_cost: int

@api_router.get("/wallet/{user_id}")
async def get_wallet(user_id: str):
    """Get user's wallet balance and transaction history"""
    try:
        # Get wallet balance
        wallet_response = supabase.table('wallets').select('*').eq('user_id', user_id).execute()
        
        if not wallet_response.data:
            # Create wallet if doesn't exist
            new_wallet = {
                'id': str(uuid.uuid4()),
                'user_id': user_id,
                'balance': 0.0,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            supabase.table('wallets').insert(new_wallet).execute()
            wallet = new_wallet
        else:
            wallet = wallet_response.data[0]
        
        # Get recent transactions
        tx_response = supabase.table('wallet_transactions').select('*').eq('user_id', user_id).order('created_at', desc=True).limit(20).execute()
        
        return {
            "balance": wallet.get('balance', 0.0),
            "transactions": tx_response.data if tx_response.data else []
        }
    except Exception as e:
        logger.error(f"Error fetching wallet: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/wallet/topup/create-payment-intent")
async def create_wallet_topup_payment_intent(request: WalletTopUpIntentRequest):
    """Create a Stripe PaymentIntent for wallet top-up."""
    try:
        if request.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")

        if not stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe is not configured on the server")

        amount_cents = int(round(request.amount * 100))
        if amount_cents <= 0:
            raise HTTPException(status_code=400, detail="Invalid top-up amount")

        customer = get_or_create_stripe_customer(request.user_id, email=request.email)

        payment_intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="cad",
            automatic_payment_methods={"enabled": True},
            customer=customer.id,
            setup_future_usage="off_session",
            metadata={
                "purpose": "wallet_topup",
                "user_id": request.user_id,
                "amount_cents": str(amount_cents),
            },
        )

        return {
            "clientSecret": payment_intent.client_secret,
            "paymentIntentId": payment_intent.id,
            "amount": amount_cents,
            "currency": "cad",
            "customerId": customer.id,
        }
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating wallet top-up intent: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating wallet top-up intent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/wallet/topup")
async def topup_wallet(request: WalletTopUpRequest):
    """Add funds to wallet after verifying Stripe payment success."""
    try:
        if request.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")

        if not stripe.api_key:
            raise HTTPException(status_code=503, detail="Stripe is not configured on the server")

        # Ensure this payment intent hasn't already been applied to wallet
        existing_tx = (
            supabase.table('wallet_transactions')
            .select('id')
            .eq('payment_intent_id', request.payment_intent_id)
            .limit(1)
            .execute()
        )
        if existing_tx.data:
            raise HTTPException(status_code=409, detail="This payment has already been applied")

        payment_intent = stripe.PaymentIntent.retrieve(request.payment_intent_id)
        if payment_intent.status != 'succeeded':
            raise HTTPException(status_code=400, detail="Payment is not completed")

        if payment_intent.currency != 'cad':
            raise HTTPException(status_code=400, detail="Unsupported payment currency")

        metadata_user_id = (payment_intent.metadata or {}).get('user_id')
        metadata_purpose = (payment_intent.metadata or {}).get('purpose')
        if metadata_purpose != 'wallet_topup' or metadata_user_id != request.user_id:
            raise HTTPException(status_code=400, detail="Payment intent does not match this wallet top-up")

        expected_cents = int(round(request.amount * 100))
        received_cents = int(payment_intent.amount_received or payment_intent.amount or 0)
        if received_cents != expected_cents:
            raise HTTPException(status_code=400, detail="Payment amount mismatch")

        topup_amount = received_cents / 100.0

        if payment_intent.customer and payment_intent.payment_method:
            stripe.Customer.modify(
                payment_intent.customer,
                invoice_settings={"default_payment_method": payment_intent.payment_method}
            )

        # Get or create wallet
        wallet_response = supabase.table('wallets').select('*').eq('user_id', request.user_id).execute()
        
        if not wallet_response.data:
            new_wallet = {
                'id': str(uuid.uuid4()),
                'user_id': request.user_id,
                'balance': topup_amount,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            supabase.table('wallets').insert(new_wallet).execute()
            new_balance = topup_amount
        else:
            wallet = wallet_response.data[0]
            new_balance = wallet['balance'] + topup_amount
            supabase.table('wallets').update({
                'balance': new_balance,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('user_id', request.user_id).execute()
        
        # Create transaction record
        tx = {
            'id': str(uuid.uuid4()),
            'user_id': request.user_id,
            'amount': topup_amount,
            'type': 'topup',
            'description': f'Added ${topup_amount:.2f} to wallet',
            'payment_intent_id': request.payment_intent_id,
            'created_at': datetime.utcnow().isoformat()
        }
        supabase.table('wallet_transactions').insert(tx).execute()
        
        return {
            "success": True,
            "new_balance": new_balance,
            "transaction_id": tx['id'],
            "payment_intent_id": request.payment_intent_id
        }
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error topping up wallet: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error topping up wallet: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/wallet/pay")
async def pay_with_wallet(user_id: str, amount: float, order_id: Optional[str] = None):
    """Pay for an order using wallet balance"""
    try:
        wallet_response = supabase.table('wallets').select('*').eq('user_id', user_id).execute()
        
        if not wallet_response.data:
            raise HTTPException(status_code=400, detail="Wallet not found")
        
        wallet = wallet_response.data[0]
        if wallet['balance'] < amount:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")
        
        new_balance = wallet['balance'] - amount
        supabase.table('wallets').update({
            'balance': new_balance,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('user_id', user_id).execute()
        
        # Create transaction record
        tx = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'amount': -amount,
            'type': 'payment',
            'description': f'Order payment - ${amount:.2f}',
            'order_id': order_id,
            'created_at': datetime.utcnow().isoformat()
        }
        supabase.table('wallet_transactions').insert(tx).execute()
        
        return {
            "success": True,
            "new_balance": new_balance
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing wallet payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Rewards Redemption ------------

@api_router.post("/rewards/redeem")
async def redeem_reward(request: RedeemRewardRequest):
    """Redeem loyalty points for a reward"""
    try:
        # Validate reward type and get points cost
        reward_costs = {
            'free_drink': 500,
            'size_upgrade': 100,
            'free_pastry': 300
        }
        
        if request.reward_type not in reward_costs:
            raise HTTPException(status_code=400, detail="Invalid reward type")
        
        points_cost = reward_costs[request.reward_type]
        
        # Get user's current points
        points_response = supabase.table('loyalty_transactions').select('points_change').eq('user_id', request.user_id).execute()
        total_points = sum(tx['points_change'] for tx in points_response.data) if points_response.data else 0
        
        if total_points < points_cost:
            raise HTTPException(status_code=400, detail=f"Insufficient points. You have {total_points}, need {points_cost}")
        
        # Create negative loyalty transaction (deduct points)
        reward_descriptions = {
            'free_drink': 'Redeemed: Free Drink',
            'size_upgrade': 'Redeemed: Size Upgrade',
            'free_pastry': 'Redeemed: Free Pastry'
        }
        
        tx = {
            'id': str(uuid.uuid4()),
            'user_id': request.user_id,
            'points_change': -points_cost,
            'transaction_type': 'redeem',
            'description': reward_descriptions[request.reward_type],
            'created_at': datetime.utcnow().isoformat()
        }
        supabase.table('loyalty_transactions').insert(tx).execute()
        
        # Create a reward voucher
        voucher = {
            'id': str(uuid.uuid4()),
            'user_id': request.user_id,
            'reward_type': request.reward_type,
            'code': f"RWD-{uuid.uuid4().hex[:8].upper()}",
            'status': 'active',
            'expires_at': (datetime.utcnow().replace(day=1) + timedelta(days=32)).replace(day=1).isoformat(),  # End of next month
            'created_at': datetime.utcnow().isoformat()
        }
        supabase.table('reward_vouchers').insert(voucher).execute()
        
        return {
            "success": True,
            "voucher_code": voucher['code'],
            "reward_type": request.reward_type,
            "points_deducted": points_cost,
            "remaining_points": total_points - points_cost
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error redeeming reward: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/rewards/{user_id}/vouchers")
async def get_user_vouchers(user_id: str):
    """Get user's active reward vouchers"""
    try:
        response = supabase.table('reward_vouchers').select('*').eq('user_id', user_id).eq('status', 'active').execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Error fetching vouchers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Gifts ------------

class GiftCreate(BaseModel):
    sender_id: str
    recipient_email: str
    amount: float
    message: Optional[str] = None

class GiftRedeem(BaseModel):
    gift_id: str
    user_id: str

@api_router.post("/gifts/send")
async def send_gift(gift_data: GiftCreate):
    """Send a gift card to someone"""
    try:
        # Check sender's wallet balance
        wallet_response = supabase.table('wallets').select('*').eq('user_id', gift_data.sender_id).execute()
        
        if not wallet_response.data:
            raise HTTPException(status_code=400, detail="Wallet not found. Please add funds first.")
        
        wallet = wallet_response.data[0]
        if wallet['balance'] < gift_data.amount:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance")
        
        # Deduct from sender's wallet
        new_balance = wallet['balance'] - gift_data.amount
        supabase.table('wallets').update({
            'balance': new_balance,
            'updated_at': datetime.utcnow().isoformat()
        }).eq('user_id', gift_data.sender_id).execute()
        
        # Create wallet transaction for sender
        sender_tx = {
            'id': str(uuid.uuid4()),
            'user_id': gift_data.sender_id,
            'amount': -gift_data.amount,
            'type': 'gift_sent',
            'description': f'Gift sent to {gift_data.recipient_email}',
            'created_at': datetime.utcnow().isoformat()
        }
        supabase.table('wallet_transactions').insert(sender_tx).execute()
        
        # Create gift record
        gift = {
            'id': str(uuid.uuid4()),
            'sender_id': gift_data.sender_id,
            'recipient_email': gift_data.recipient_email,
            'amount': gift_data.amount,
            'message': gift_data.message,
            'code': f"GIFT-{uuid.uuid4().hex[:8].upper()}",
            'status': 'pending',
            'created_at': datetime.utcnow().isoformat()
        }
        supabase.table('gifts').insert(gift).execute()
        
        return {
            "success": True,
            "gift_id": gift['id'],
            "gift_code": gift['code'],
            "amount": gift_data.amount,
            "new_wallet_balance": new_balance
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending gift: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/gifts/{user_id}")
async def get_user_gifts(user_id: str, user_email: Optional[str] = None):
    """Get gifts sent and received by user"""
    try:
        # Get sent gifts
        sent_response = supabase.table('gifts').select('*').eq('sender_id', user_id).order('created_at', desc=True).execute()
        sent_gifts = sent_response.data if sent_response.data else []
        
        # Get received gifts (by email)
        received_gifts = []
        if user_email:
            received_response = supabase.table('gifts').select('*').eq('recipient_email', user_email).order('created_at', desc=True).execute()
            received_gifts = received_response.data if received_response.data else []
        
        return {
            "sent": sent_gifts,
            "received": received_gifts
        }
    except Exception as e:
        logger.error(f"Error fetching gifts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/gifts/redeem")
async def redeem_gift(redeem_data: GiftRedeem):
    """Redeem a gift card"""
    try:
        # Get the gift
        gift_response = supabase.table('gifts').select('*').eq('id', redeem_data.gift_id).single().execute()
        
        if not gift_response.data:
            raise HTTPException(status_code=404, detail="Gift not found")
        
        gift = gift_response.data
        
        if gift['status'] != 'pending':
            raise HTTPException(status_code=400, detail="Gift has already been redeemed or expired")
        
        # Add to recipient's wallet
        wallet_response = supabase.table('wallets').select('*').eq('user_id', redeem_data.user_id).execute()
        
        if not wallet_response.data:
            # Create wallet
            new_wallet = {
                'id': str(uuid.uuid4()),
                'user_id': redeem_data.user_id,
                'balance': gift['amount'],
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
            supabase.table('wallets').insert(new_wallet).execute()
            new_balance = gift['amount']
        else:
            wallet = wallet_response.data[0]
            new_balance = wallet['balance'] + gift['amount']
            supabase.table('wallets').update({
                'balance': new_balance,
                'updated_at': datetime.utcnow().isoformat()
            }).eq('user_id', redeem_data.user_id).execute()
        
        # Create wallet transaction
        tx = {
            'id': str(uuid.uuid4()),
            'user_id': redeem_data.user_id,
            'amount': gift['amount'],
            'type': 'gift_received',
            'description': f'Gift card redeemed - ${gift["amount"]:.2f}',
            'created_at': datetime.utcnow().isoformat()
        }
        supabase.table('wallet_transactions').insert(tx).execute()
        
        # Update gift status
        supabase.table('gifts').update({
            'status': 'redeemed',
            'redeemed_by': redeem_data.user_id,
            'redeemed_at': datetime.utcnow().isoformat()
        }).eq('id', redeem_data.gift_id).execute()
        
        return {
            "success": True,
            "amount_added": gift['amount'],
            "new_wallet_balance": new_balance
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error redeeming gift: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Notifications ------------

class NotificationCreate(BaseModel):
    user_id: str
    title: str
    message: str
    type: str  # 'order', 'promo', 'reward', 'gift', 'system'
    data: Optional[dict] = None

@api_router.get("/notifications/{user_id}")
async def get_notifications(user_id: str, limit: int = 50):
    """Get user's notifications"""
    try:
        response = supabase.table('notifications').select('*').eq('user_id', user_id).order('created_at', desc=True).limit(limit).execute()
        return response.data if response.data else []
    except Exception as e:
        logger.error(f"Error fetching notifications: {e}")
        # Return empty list if table doesn't exist
        return []

@api_router.post("/notifications")
async def create_notification(notification: NotificationCreate):
    """Create a new notification"""
    try:
        notif = {
            'id': str(uuid.uuid4()),
            'user_id': notification.user_id,
            'title': notification.title,
            'message': notification.message,
            'type': notification.type,
            'data': notification.data,
            'read': False,
            'created_at': datetime.utcnow().isoformat()
        }
        supabase.table('notifications').insert(notif).execute()
        return notif
    except Exception as e:
        logger.error(f"Error creating notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    """Mark a notification as read"""
    try:
        supabase.table('notifications').update({'read': True}).eq('id', notification_id).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking notification read: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.patch("/notifications/{user_id}/read-all")
async def mark_all_notifications_read(user_id: str):
    """Mark all user notifications as read"""
    try:
        supabase.table('notifications').update({'read': True}).eq('user_id', user_id).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking all notifications read: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ------------ Promos/Offers ------------

@api_router.get("/promos")
async def get_promos():
    """Get active promotions and offers"""
    try:
        response = supabase.table('promos').select('*').eq('is_active', True).order('sort_order').execute()
        if response.data:
            return response.data
        # Return default promos if none in database
        return [
            {
                'id': 'promo-1',
                'title': 'Exclusive Offer',
                'subtitle': 'Save up to 30% off',
                'discount_text': '30% OFF',
                'bg_color': '#FFF8DC',
                'accent_color': '#FF9800',
                'type': 'discount',
                'is_active': True,
            },
            {
                'id': 'promo-2',
                'title': 'Happy Hour',
                'subtitle': '2-5 PM Daily',
                'discount_text': 'BOGO',
                'bg_color': '#E3F2FD',
                'accent_color': '#1E88E5',
                'type': 'bogo',
                'is_active': True,
            },
            {
                'id': 'promo-3',
                'title': 'New: Summer Menu',
                'subtitle': 'Try our new cold brews',
                'discount_text': 'NEW',
                'bg_color': '#E8F5E9',
                'accent_color': '#4CAF50',
                'type': 'announcement',
                'is_active': True,
            },
            {
                'id': 'promo-4',
                'title': 'Double Points',
                'subtitle': 'Earn 2x beans this weekend',
                'discount_text': '2X',
                'bg_color': '#FFF3E0',
                'accent_color': '#FF5722',
                'type': 'rewards',
                'is_active': True,
            },
        ]
    except Exception as e:
        logger.error(f"Error fetching promos: {e}")
        # Return defaults on error
        return [
            {
                'id': 'promo-1',
                'title': 'Exclusive Offer',
                'subtitle': 'Save up to 30% off',
                'discount_text': '30% OFF',
                'bg_color': '#FFF8DC',
                'accent_color': '#FF9800',
                'type': 'discount',
                'is_active': True,
            }
        ]

# ------------ Advanced Search ------------

@api_router.get("/search")
async def search(q: str, limit: int = 20):
    """Advanced search across shops and menu items"""
    try:
        query = q.lower().strip()
        results = {
            'shops': [],
            'menu_items': [],
            'suggestions': []
        }
        
        if not query:
            return results
        
        # Search shops with fuzzy matching
        shops_response = supabase.table('shops').select('*').eq('is_active', True).execute()
        shops = shops_response.data if shops_response.data else []
        
        # Score and rank shops
        scored_shops = []
        for shop in shops:
            score = 0
            name_lower = shop['name'].lower()
            desc_lower = (shop.get('description') or '').lower()
            address_lower = (shop.get('address') or '').lower()
            
            # Exact match in name (highest priority)
            if query == name_lower:
                score += 100
            # Starts with query
            elif name_lower.startswith(query):
                score += 80
            # Contains query as whole word
            elif f' {query} ' in f' {name_lower} ' or f' {query}' in f' {name_lower}' or f'{query} ' in f'{name_lower} ':
                score += 60
            # Contains query
            elif query in name_lower:
                score += 40
            # Check description
            if query in desc_lower:
                score += 20
            # Check address
            if query in address_lower:
                score += 10
            
            # Fuzzy matching for typos
            if score == 0:
                # Simple character overlap check
                overlap = sum(1 for c in query if c in name_lower)
                if overlap >= len(query) * 0.7:
                    score += 15
            
            if score > 0:
                scored_shops.append({**shop, '_score': score})
        
        # Sort by score descending
        scored_shops.sort(key=lambda x: x['_score'], reverse=True)
        results['shops'] = scored_shops[:limit]
        
        # Search menu items
        menu_response = supabase.table('menu_items').select('*, shops(name)').eq('is_available', True).execute()
        menu_items = menu_response.data if menu_response.data else []
        
        scored_items = []
        for item in menu_items:
            score = 0
            name_lower = item['name'].lower()
            desc_lower = (item.get('description') or '').lower()
            category_lower = (item.get('category') or '').lower()
            
            if query == name_lower:
                score += 100
            elif name_lower.startswith(query):
                score += 80
            elif query in name_lower:
                score += 50
            if query in desc_lower:
                score += 20
            if query in category_lower:
                score += 30
            
            if score > 0:
                normalized_price = item.get('price')
                if normalized_price is None:
                    normalized_price = item.get('base_price')

                scored_items.append({
                    **item,
                    'price': normalized_price,
                    '_score': score
                })
        
        scored_items.sort(key=lambda x: x['_score'], reverse=True)
        results['menu_items'] = scored_items[:limit]
        
        # Generate suggestions based on popular searches
        popular = ['Latte', 'Espresso', 'Cold Brew', 'Matcha', 'Cappuccino', 'Americano', 'Mocha', 'Croissant']
        results['suggestions'] = [p for p in popular if query in p.lower()][:5]
        
        return results
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {'shops': [], 'menu_items': [], 'suggestions': []}

# ------------ Seed Data ------------

@api_router.get("/setup-instructions")
async def get_setup_instructions():
    """Get SQL instructions to set up Supabase tables"""
    sql = """
-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard/project/pibppnrlatwgstcitnfi/sql)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Shops table
CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    address TEXT NOT NULL,
    city TEXT DEFAULT 'Toronto',
    latitude DECIMAL,
    longitude DECIMAL,
    phone TEXT,
    email TEXT,
    hours JSONB,
    is_active BOOLEAN DEFAULT true,
    rating DECIMAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    loyalty_multiplier DECIMAL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Menu items table
CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    base_price DECIMAL NOT NULL,
    image_url TEXT,
    customization_options JSONB,
    is_available BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number TEXT UNIQUE,
    user_id TEXT NOT NULL,
    shop_id TEXT REFERENCES shops(id),
    shop_name TEXT,
    items JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    subtotal DECIMAL NOT NULL,
    tax DECIMAL DEFAULT 0,
    discount DECIMAL DEFAULT 0,
    total DECIMAL NOT NULL,
    pickup_time TEXT,
    special_instructions TEXT,
    stripe_payment_id TEXT,
    points_earned INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loyalty transactions table
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    shop_id TEXT REFERENCES shops(id),
    order_id TEXT REFERENCES orders(id),
    points_change INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    balance DECIMAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    payment_intent_id TEXT,
    order_id TEXT REFERENCES orders(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_shop_id ON menu_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_user_id ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_payment_intent_id
ON wallet_transactions(payment_intent_id)
WHERE payment_intent_id IS NOT NULL;

-- Wallet RLS policies
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
CREATE POLICY "wallets_select_own"
ON wallets
FOR SELECT
TO authenticated
USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
CREATE POLICY "wallets_insert_own"
ON wallets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
CREATE POLICY "wallets_update_own"
ON wallets
FOR UPDATE
TO authenticated
USING (auth.uid()::TEXT = user_id)
WITH CHECK (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "wallet_tx_select_own" ON wallet_transactions;
CREATE POLICY "wallet_tx_select_own"
ON wallet_transactions
FOR SELECT
TO authenticated
USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "wallet_tx_insert_own" ON wallet_transactions;
CREATE POLICY "wallet_tx_insert_own"
ON wallet_transactions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::TEXT = user_id);
"""
    return {
        "message": "Copy and run this SQL in your Supabase SQL Editor",
        "dashboard_url": "https://supabase.com/dashboard/project/pibppnrlatwgstcitnfi/sql",
        "sql": sql
    }

@api_router.post("/seed")
async def seed_database():
    """Seed the database with sample data"""
    try:
        # Clear existing data
        supabase.table('menu_items').delete().neq('id', '').execute()
        supabase.table('shops').delete().neq('id', '').execute()
        
        # Create sample shops
        shops_data = [
            {
                "id": "shop-1",
                "name": "Moonbean Coffee",
                "description": "Artisanal coffee roasted in-house with care and passion",
                "address": "30 St Andrews St, Toronto, ON M5T 1K6",
                "city": "Toronto",
                "latitude": 43.6510,
                "longitude": -79.3835,
                "rating": 4.8,
                "rating_count": 703,
                "is_active": True,
                "hours": {
                    "monday": {"open": "07:00", "close": "18:00"},
                    "tuesday": {"open": "07:00", "close": "18:00"},
                    "wednesday": {"open": "07:00", "close": "18:00"},
                    "thursday": {"open": "07:00", "close": "18:00"},
                    "friday": {"open": "07:00", "close": "18:00"},
                    "saturday": {"open": "08:00", "close": "17:00"},
                    "sunday": {"open": "08:00", "close": "17:00"},
                },
                "loyalty_multiplier": 1.0,
                "created_at": datetime.utcnow().isoformat(),
            },
            {
                "id": "shop-2",
                "name": "Chapter Coffee",
                "description": "Specialty coffee and books in a cozy atmosphere",
                "address": "456 Queen St W, Toronto, ON M5V 2B5",
                "city": "Toronto",
                "latitude": 43.6485,
                "longitude": -79.3980,
                "rating": 4.9,
                "rating_count": 56,
                "is_active": True,
                "hours": {
                    "monday": {"open": "08:00", "close": "20:00"},
                    "tuesday": {"open": "08:00", "close": "20:00"},
                    "wednesday": {"open": "08:00", "close": "20:00"},
                    "thursday": {"open": "08:00", "close": "20:00"},
                    "friday": {"open": "08:00", "close": "21:00"},
                    "saturday": {"open": "09:00", "close": "21:00"},
                    "sunday": {"open": "09:00", "close": "18:00"},
                },
                "loyalty_multiplier": 1.5,
                "created_at": datetime.utcnow().isoformat(),
            },
            {
                "id": "shop-3",
                "name": "Opal Coffee",
                "description": "Modern third-wave coffee experience",
                "address": "789 College St, Toronto, ON M6G 1C7",
                "city": "Toronto",
                "latitude": 43.6544,
                "longitude": -79.4235,
                "rating": 5.0,
                "rating_count": 654,
                "is_active": True,
                "hours": {
                    "monday": {"open": "07:00", "close": "19:00"},
                    "tuesday": {"open": "07:00", "close": "19:00"},
                    "wednesday": {"open": "07:00", "close": "19:00"},
                    "thursday": {"open": "07:00", "close": "19:00"},
                    "friday": {"open": "07:00", "close": "19:00"},
                    "saturday": {"open": "08:00", "close": "18:00"},
                    "sunday": {"open": "08:00", "close": "18:00"},
                },
                "loyalty_multiplier": 2.0,
                "created_at": datetime.utcnow().isoformat(),
            },
        ]
        
        supabase.table('shops').insert(shops_data).execute()
        
        # Create sample menu items for each shop
        menu_items_template = [
            {
                "name": "Latte",
                "description": "Espresso with steamed milk. Our signature drink with smooth, velvety texture.",
                "category": "espresso",
                "base_price": 5.00,
                "is_available": True,
                "is_featured": True,
                "sort_order": 1,
                "customization_options": {
                    "beans": ["Brazil (default)", "Ethiopia (+$1.00)", "Colombia (+$0.50)"],
                    "milk": ["Whole (default)", "Oat (+$0.50)", "Almond (+$0.50)", "Soy (+$0.50)"],
                    "size": ["Small (-$1.00)", "Medium (default)", "Large (+$1.00)"],
                    "shots": ["1 (-$0.50)", "2 (default)", "3 (+$0.50)"],
                },
            },
            {
                "name": "Cappuccino",
                "description": "Espresso with foamed milk. Classic Italian style.",
                "category": "espresso",
                "base_price": 4.75,
                "is_available": True,
                "is_featured": False,
                "sort_order": 2,
                "customization_options": {
                    "beans": ["Brazil (default)", "Ethiopia (+$1.00)"],
                    "milk": ["Whole (default)", "Oat (+$0.50)"],
                    "size": ["Small (-$0.75)", "Medium (default)", "Large (+$0.75)"],
                },
            },
            {
                "name": "Americano",
                "description": "Espresso diluted with hot water. Bold and smooth.",
                "category": "espresso",
                "base_price": 3.50,
                "is_available": True,
                "is_featured": False,
                "sort_order": 3,
                "customization_options": {
                    "beans": ["Brazil (default)", "Ethiopia (+$1.00)"],
                    "size": ["Small (-$0.50)", "Medium (default)", "Large (+$0.50)"],
                    "shots": ["1", "2 (default)", "3 (+$0.50)"],
                },
            },
            {
                "name": "Cold Brew",
                "description": "Smooth cold-steeped coffee. Refreshing and bold.",
                "category": "cold_brew",
                "base_price": 5.50,
                "is_available": True,
                "is_featured": True,
                "sort_order": 4,
                "customization_options": {
                    "size": ["Small (-$1.00)", "Medium (default)", "Large (+$1.00)"],
                    "ice": ["Light", "Regular (default)", "Extra"],
                    "sweetness": ["None (default)", "1 pump (+$0.25)", "2 pumps (+$0.50)"],
                },
            },
            {
                "name": "Iced Latte",
                "description": "Espresso with cold milk over ice. Perfect for warm days.",
                "category": "cold_brew",
                "base_price": 5.25,
                "is_available": True,
                "is_featured": False,
                "sort_order": 5,
                "customization_options": {
                    "beans": ["Brazil (default)", "Ethiopia (+$1.00)"],
                    "milk": ["Whole (default)", "Oat (+$0.50)", "Almond (+$0.50)"],
                    "size": ["Small (-$1.00)", "Medium (default)", "Large (+$1.00)"],
                    "ice": ["Light", "Regular (default)", "Extra"],
                },
            },
            {
                "name": "Matcha Latte",
                "description": "Premium ceremonial grade matcha with steamed milk.",
                "category": "specialty",
                "base_price": 6.00,
                "is_available": True,
                "is_featured": False,
                "sort_order": 6,
                "customization_options": {
                    "milk": ["Whole (default)", "Oat (+$0.50)", "Almond (+$0.50)"],
                    "size": ["Small (-$1.00)", "Medium (default)", "Large (+$1.00)"],
                    "sweetness": ["None", "Light (default)", "Regular", "Extra"],
                },
            },
            {
                "name": "Chai Latte",
                "description": "Spiced tea with steamed milk. Warm and comforting.",
                "category": "specialty",
                "base_price": 5.50,
                "is_available": True,
                "is_featured": False,
                "sort_order": 7,
                "customization_options": {
                    "milk": ["Whole (default)", "Oat (+$0.50)", "Almond (+$0.50)"],
                    "size": ["Small (-$1.00)", "Medium (default)", "Large (+$1.00)"],
                    "sweetness": ["Light", "Regular (default)", "Extra"],
                },
            },
            {
                "name": "Croissant",
                "description": "Buttery, flaky French pastry. Freshly baked daily.",
                "category": "pastry",
                "base_price": 3.50,
                "is_available": True,
                "is_featured": False,
                "sort_order": 8,
            },
            {
                "name": "Almond Croissant",
                "description": "Classic croissant filled with almond cream.",
                "category": "pastry",
                "base_price": 4.25,
                "is_available": True,
                "is_featured": False,
                "sort_order": 9,
            },
            {
                "name": "Blueberry Muffin",
                "description": "Moist muffin loaded with fresh blueberries.",
                "category": "pastry",
                "base_price": 3.75,
                "is_available": True,
                "is_featured": False,
                "sort_order": 10,
            },
        ]
        
        menu_items_to_insert = []
        for shop_data in shops_data:
            for item_template in menu_items_template:
                menu_item = {
                    "id": f"menu-{shop_data['id']}-{item_template['sort_order']}",
                    "shop_id": shop_data["id"],
                    **item_template,
                    "created_at": datetime.utcnow().isoformat(),
                }
                menu_items_to_insert.append(menu_item)
        
        supabase.table('menu_items').insert(menu_items_to_insert).execute()
        
        return {
            "message": "Database seeded successfully",
            "shops_created": len(shops_data),
            "menu_items_created": len(menu_items_to_insert)
        }
    except Exception as e:
        logger.error(f"Error seeding database: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
