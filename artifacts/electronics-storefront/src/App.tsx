import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  useCreateAdminProduct, useCreateStoreOrder, useDeleteAdminProduct,
  useGetAdminDashboard, useHealthCheck, useListAdminCustomers,
  useListAdminOrders, useListAdminProducts, useListStoreProducts,
  useUpdateAdminCustomer, useUpdateAdminOrder, useUpdateAdminProduct,
  getGetAdminDashboardQueryKey, getListAdminCustomersQueryKey,
  getListAdminOrdersQueryKey, getListAdminProductsQueryKey,
  getListStoreProductsQueryKey,
} from '@workspace/api-client-react';
import type { Customer, CustomerUpdate, Order, OrderStatus, Product, ProductInput, ProductUpdate } from '@workspace/api-client-react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Check,
  ChevronDown, ChevronRight, CircleHelp, CreditCard,
  Headphones, LogOut, Menu, Minus, PackageCheck, Plus, Search,
  ShieldCheck, ShoppingBag, ShoppingCart, SlidersHorizontal, Truck, UserRound,
  X, Camera, Gamepad2, Laptop, Watch, Tablet, Smartphone, Wind, Package,
  LayoutDashboard, Boxes, ClipboardList, Users, Pencil, Trash2, PlusCircle,
  RefreshCw, ChartNoAxesCombined,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const rub = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
const dateRu = (value?: string | null) => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const image = (name: string) => `/images/${name}.webp`;
type CartLine = { product: Product; quantity: number };

function useStoredCart(): [CartLine[], (next: CartLine[] | ((prev: CartLine[]) => CartLine[])) => void] {
  const [cart, setCart] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem('tp-cart') || '[]') as CartLine[]; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem('tp-cart', JSON.stringify(cart)); }, [cart]);
  return [cart, setCart];
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className={`brand-mark ${compact ? 'brand-mark-small' : ''}`} aria-label="Техно. Поинт — на главную" data-testid="link-home">
    <img src={image('reference-003')} alt="Техно. Поинт" />
  </Link>;
}
function ShopHeader({ cartCount, onCart, search, onSearch, admin = false }: { cartCount: number; onCart: () => void; search?: string; onSearch?: (v: string) => void; admin?: boolean }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  return <header className="store-header">
    <div className="header-main">
      <BrandMark />
      <button className="catalog-trigger" onClick={() => { document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' }); setMobileMenu(false); }} data-testid="button-catalog"><Menu size={17} /> Каталог</button>
      <form className="header-search" onSubmit={e => { e.preventDefault(); document.getElementById('new-products')?.scrollIntoView({ behavior: 'smooth' }); }}>
        <Search size={17} /><input aria-label="Поиск товаров" placeholder="Найти технику" value={search ?? ''} onChange={e => onSearch?.(e.target.value)} data-testid="input-search" />
        <button type="submit" aria-label="Искать" data-testid="button-search"><ArrowRight size={16} /></button>
      </form>
      <div className="header-actions">
        <Link href="/account" className="header-icon" aria-label="Личный кабинет" data-testid="button-account"><UserRound size={18} /><span>Кабинет</span></Link>
        <button className="header-icon" onClick={onCart} aria-label={`Корзина: ${cartCount}`} data-testid="button-cart"><ShoppingBag size={18} /><span>Корзина</span>{cartCount > 0 && <b className="cart-count">{cartCount}</b>}</button>
        {admin && <Link href="/admin" className="admin-shortcut">Панель</Link>}
      </div>
      <button className="mobile-menu-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Открыть меню" data-testid="button-mobile-menu">{mobileMenu ? <X /> : <Menu />}</button>
    </div>
    <div className={`header-sub ${mobileMenu ? 'is-open' : ''}`}>
      <span>Техника, которую выбирают</span><nav><a href="#categories">Каталог</a><a href="#about">О компании</a><a href="#brands">Бренды</a><button onClick={() => document.getElementById('delivery')?.scrollIntoView({ behavior: 'smooth' })}>Доставка и оплата</button></nav>
      <a href="tel:+78005553535" className="header-phone">8 800 555-35-35</a>
    </div>
  </header>;
}

const categoryTiles = [
  { title: 'Смартфоны', image: 'reference-019', icon: Smartphone, filter: 'Смартфоны' },
  { title: 'Ноутбуки и ПК', image: 'reference-087', icon: Laptop, filter: 'Ноутбуки и ПК' },
  { title: 'Часы', image: 'reference-094', icon: Watch, filter: 'Часы' },
  { title: 'DJI', image: 'reference-031', icon: Camera, filter: 'Dji' },
  { title: 'Игровые консоли и аксессуары', image: 'reference-101', icon: Gamepad2, filter: 'Игровые консоли и аксессуары' },
  { title: 'Аудио', image: 'reference-055', icon: Headphones, filter: 'Аудио' },
  { title: 'Телевизоры и оптика', image: 'reference-043', icon: CircleHelp, filter: 'Тепловизоры и оптика' },
  { title: 'Фото', image: 'reference-012', icon: Camera, filter: 'Фото' },
  { title: 'Планшеты', image: 'reference-018', icon: Tablet, filter: 'Планшеты' },
];

function CategoryMosaic({ onSelect }: { onSelect: (category: string) => void }) {
  return <section id="categories" className="categories-section shop-inner">
    <div className="section-head"><div><span className="eyebrow">ВЫБИРАЙТЕ СВОЁ</span><h2 className="section-title">Категории техники</h2></div><span className="section-count">01 — 09</span></div>
    <div className="category-grid">
      {categoryTiles.map((tile, i) => <button key={tile.title} className={`category-tile cat-${i}`} onClick={() => onSelect(tile.filter)} data-testid={`category-${i}`}>
        <span className="tile-title">{tile.title}</span><img src={image(tile.image)} alt="" /><span className="tile-go"><ArrowUpRight size={16} /></span>
      </button>)}
      <button className="category-tile cat-dyson" onClick={() => onSelect('Dyson')} data-testid="category-dyson">
        <div className="dyson-copy"><span className="eyebrow">ТЕХНОЛОГИИ ДЛЯ ДОМА</span><strong>Dyson</strong><span>Инженерия, которую видно</span><span className="tile-go"><ArrowUpRight size={16} /></span></div>
        <img src={image('reference-081')} alt="Техника Dyson" />
      </button>
    </div>
  </section>;
}

function ProductCard({ product, addToCart, onDetails }: { product: Product; addToCart: (p: Product) => void; onDetails: (p: Product) => void }) {
  return <article className="product-card" data-testid={`card-product-${product.id}`}>
    <button className="product-photo" onClick={() => onDetails(product)} aria-label={`Подробнее: ${product.name}`}><span className="product-badge">{product.badge || (product.isNew ? 'Новинка' : 'В наличии')}</span><img src={product.imageUrl || image('reference-007')} alt={product.name} className="product-image" /></button>
    <div className="product-meta"><span>{product.brand}</span><span className="stock-line"><i /> {product.stock > 0 ? 'В наличии' : 'Под заказ'}</span></div>
    <button className="product-name" onClick={() => onDetails(product)} data-testid={`text-product-name-${product.id}`}>{product.name}</button>
    <div className="product-bottom"><div><strong>{rub(product.price)}</strong>{product.oldPrice && <del>{rub(product.oldPrice)}</del>}</div><button className="add-button" onClick={() => addToCart(product)} aria-label={`В корзину: ${product.name}`} data-testid={`button-add-cart-${product.id}`}><ShoppingCart size={17} /></button></div>
  </article>;
}
function ProductLoading() { return <div className="product-grid">{[1, 2, 3, 4].map(n => <div className="product-skeleton" key={n}><div /><i /><i /><i /></div>)}</div>; }

function CartDrawer({ cart, setCart, close, checkout }: { cart: CartLine[]; setCart: (n: CartLine[] | ((p: CartLine[]) => CartLine[])) => void; close: () => void; checkout: () => void }) {
  const total = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  return <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Корзина">
      <div className="drawer-heading"><div><span className="eyebrow">ВАШ ВЫБОР</span><h2>Корзина <small>{cart.length}</small></h2></div><button onClick={close} className="icon-button" aria-label="Закрыть корзину" data-testid="button-close-cart"><X /></button></div>
      <div className="cart-lines">{cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={32} /><h3>Пока здесь пусто</h3><p>Добавьте технику, и мы всё сохраним.</p><button className="button-dark" onClick={close}>К покупкам</button></div> : cart.map(line => <div className="cart-line" key={line.product.id}>
        <img src={line.product.imageUrl || image('reference-007')} alt="" /><div className="cart-line-info"><strong>{line.product.name}</strong><b>{rub(line.product.price * line.quantity)}</b><div className="quantity-control"><button onClick={() => setCart(old => old.map(x => x.product.id === line.product.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))} aria-label="Уменьшить количество"><Minus size={13} /></button><span>{line.quantity}</span><button onClick={() => setCart(old => old.map(x => x.product.id === line.product.id ? { ...x, quantity: x.quantity + 1 } : x))} aria-label="Увеличить количество"><Plus size={13} /></button></div></div><button className="remove-line" onClick={() => setCart(old => old.filter(x => x.product.id !== line.product.id))} aria-label="Убрать товар"><X size={15} /></button>
      </div>)}</div>
      {cart.length > 0 && <div className="cart-summary"><div className="delivery-note"><Truck size={16} /> Бесплатная доставка от 15 000 ₽</div><div className="cart-total"><span>Итого</span><strong>{rub(total)}</strong></div><button className="button-purple checkout-button" onClick={checkout} data-testid="button-checkout">Перейти к оформлению <ArrowRight size={16} /></button><p>Нажимая кнопку, вы переходите к оформлению заказа</p></div>}
    </aside>
  </div>;
}

function CheckoutDialog({ cart, onClose, onComplete }: { cart: CartLine[]; onClose: () => void; onComplete: () => void }) {
  const client = useQueryClient();
  const order = useCreateStoreOrder();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const total = cart.reduce((sum, x) => sum + x.product.price * x.quantity, 0);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError('');
    const form = new FormData(e.currentTarget);
    order.mutate({ data: { customerName: String(form.get('name')), email: String(form.get('email')), phone: String(form.get('phone')), address: String(form.get('address')), items: cart.map(x => ({ productId: x.product.id, quantity: x.quantity })) } }, {
      onSuccess: () => { setDone(true); onComplete(); client.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() }); client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); client.invalidateQueries({ queryKey: getListAdminCustomersQueryKey() }); }, onError: () => setError('Не удалось оформить заказ. Проверьте данные и попробуйте ещё раз.'),
    });
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="checkout-modal" role="dialog" aria-modal="true" aria-label="Оформление заказа">
    <div className="modal-heading"><div><span className="eyebrow">{done ? 'ГОТОВО' : 'ЗАКАЗ В ТЕХНО. ПОИНТ'}</span><h2>{done ? 'Спасибо за заказ' : 'Оформление'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X /></button></div>
    {done ? <div className="success-state"><span><Check /></span><p>Заказ передан в обработку. Менеджер свяжется с вами для подтверждения.</p><button className="button-purple" onClick={onClose}>Продолжить покупки</button></div> : <>
      <div className="checkout-total"><span>{cart.reduce((sum, x) => sum + x.quantity, 0)} товара</span><strong>{rub(total)}</strong></div>
      <form className="checkout-form" onSubmit={submit}>
        <label>Ваше имя<input name="name" required minLength={1} placeholder="Александр Иванов" data-testid="input-customer-name" /></label>
        <div className="form-pair"><label>Телефон<input name="phone" required placeholder="+7 900 000-00-00" data-testid="input-customer-phone" /></label><label>E-mail<input name="email" type="email" placeholder="mail@example.ru" data-testid="input-customer-email" /></label></div>
        <label>Адрес доставки<input name="address" required placeholder="Город, улица, дом" data-testid="input-customer-address" /></label>
        {error && <p className="form-error">{error}</p>}<button className="button-purple checkout-button" type="submit" disabled={order.isPending} data-testid="button-place-order">{order.isPending ? 'Отправляем заказ…' : <>Подтвердить заказ <ArrowRight size={16} /></>}</button>
        <p className="form-hint"><ShieldCheck size={14} /> Данные защищены. Оплата — после подтверждения заказа.</p>
      </form>
    </>}
  </div></div>;
}

function ProductDetails({ product, close, add }: { product: Product; close: () => void; add: (p: Product) => void }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="details-modal" role="dialog" aria-modal="true" aria-label={product.name}>
    <button className="icon-button details-close" onClick={close} aria-label="Закрыть"><X /></button><div className="details-image"><img src={product.imageUrl || image('reference-007')} alt={product.name} /></div>
    <div className="details-content"><span className="eyebrow">{product.brand} / {product.category}</span><h2>{product.name}</h2><p>{product.description || 'Оригинальная техника с гарантией и быстрой доставкой.'}</p><div className="detail-stock"><BadgeCheck size={16} /> {product.stock > 0 ? 'Есть в наличии' : 'Доступен под заказ'}</div><strong className="detail-price">{rub(product.price)}</strong><button className="button-purple checkout-button" onClick={() => { add(product); close(); }}>Добавить в корзину <ShoppingCart size={16} /></button></div>
  </div></div>;
}

function Storefront() {
  const [cart, setCart] = useStoredCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState<Product | null>(null);
  const queryKey = getListStoreProductsQueryKey({ search: search || undefined });
  const { data: products, isLoading, isError, refetch } = useListStoreProducts({ search: search || undefined }, { query: { queryKey } });
  const health = useHealthCheck();
  const available = useMemo(() => (products || []).filter(p => !category || p.category.toLowerCase().includes(category.toLowerCase()) || p.brand.toLowerCase().includes(category.toLowerCase())), [products, category]);
  const addToCart = (product: Product) => setCart(old => { const found = old.find(x => x.product.id === product.id); return found ? old.map(x => x.product.id === product.id ? { ...x, quantity: x.quantity + 1 } : x) : [...old, { product, quantity: 1 }]; });
  const newProducts = useMemo(() => {
    const marked = available.filter(p => p.isNew || p.featured);
    return (marked.length ? marked : available).slice(0, 4);
  }, [available]);
  const [showAll, setShowAll] = useState(false);
  const shownProducts = showAll ? available : newProducts;
  return <main className="storefront">
    <div className="shop-frame page-enter">
      <div className="shop-inner">
        <ShopHeader cartCount={cart.reduce((n, x) => n + x.quantity, 0)} onCart={() => setCartOpen(true)} search={search} onSearch={setSearch} />
        <section className="hero-banner" aria-label="iPhone Air">
          <div className="hero-copy"><span className="hero-kicker"><span /> НОВИНКА 2025</span><h1>iPhone Air</h1><p>Самый тонкий iPhone за всю историю.<br />С самой профессиональной камерой.</p><button className="hero-cta" onClick={() => { setSearch('iPhone Air'); document.getElementById('new-products')?.scrollIntoView({ behavior: 'smooth' }); }}>Подробнее <ArrowRight size={15} /></button></div>
          <div className="hero-art"><img src={image('reference-001')} alt="iPhone Air в нескольких цветах" /></div>
          <div className="hero-index"><span>01</span><i /><span>03</span></div>
        </section>
        <div className="trust-line" id="delivery"><span><Truck /> Доставка по всей России</span><span><ShieldCheck /> Только оригинальная техника</span><span><CreditCard /> Удобная оплата</span></div>
      </div>
      <CategoryMosaic onSelect={value => { setCategory(value); setShowAll(false); setSearch(''); document.getElementById('new-products')?.scrollIntoView({ behavior: 'smooth' }); }} />
      <section className="company-strip" id="about"><div className="company-inner"><div className="company-heading"><span className="eyebrow">ТЕХНО. ПОИНТ</span><h2>Техника с характером.<br /><em>Сервис с заботой.</em></h2></div><p>Подбираем лучшие устройства, проверяем каждую поставку и остаёмся рядом после покупки. Потому что хороший выбор начинается с доверия.</p><div className="company-stats"><div><strong>12</strong><span>лет рядом</span></div><div><strong>45<span>к+</span></strong><span>довольных клиентов</span></div><div><strong>1 год</strong><span>гарантии на всё</span></div></div><a href="tel:+78005553535" className="company-contact">Связаться <ArrowUpRight size={16} /></a></div></section>
      <section className="new-section shop-inner" id="new-products">
        <div className="section-head"><div><span className="eyebrow">ТОЛЬКО ЧТО В КАТАЛОГЕ</span><h2 className="section-title">{category ? category : 'Новинки'}</h2></div><div className="section-controls">{category && <button className="clear-filter" onClick={() => setCategory('')}>Сбросить фильтр <X size={14} /></button>}<button className="round-arrow" onClick={() => document.getElementById('products-track')?.scrollBy({ left: 300, behavior: 'smooth' })} aria-label="Следующие товары"><ChevronRight /></button></div></div>
        {isLoading ? <ProductLoading /> : isError ? <div className="inline-error"><CircleHelp /><div><strong>Не удалось загрузить каталог</strong><span>Попробуйте обновить список товаров.</span></div><button onClick={() => refetch()}><RefreshCw size={15} /> Повторить</button></div> : shownProducts.length > 0 ? <div className="product-grid" id="products-track">{shownProducts.map(product => <ProductCard key={product.id} product={product} addToCart={addToCart} onDetails={setDetails} />)}</div> : <div className="empty-products"><Package size={27} /><div><strong>{category ? 'В этой категории пока нет товаров' : 'Скоро появятся новинки'}</strong><p>{category ? 'Выберите другую категорию или посмотрите весь каталог.' : 'Мы обновляем каталог — загляните чуть позже.'}</p></div>{category && <button onClick={() => { setCategory(''); setShowAll(false); }}>Показать всё</button>}</div>}
        {!isLoading && !isError && available.length > 4 && <div className="all-products"><span>Показано {shownProducts.length} из {available.length} товаров</span><button onClick={() => setShowAll(!showAll)}>{showAll ? 'Только новинки' : 'Весь каталог'} <ArrowRight size={15} /></button></div>}
      </section>
      <section id="brands" className="brands-section shop-inner"><div className="brand-intro"><span className="eyebrow">МЫ ВЫБИРАЕМ ЛУЧШЕЕ</span><h2 className="section-title">Бренды, которым доверяем</h2></div><div className="brand-row">{['Apple', 'Samsung', 'DJI', 'Dyson', 'Sony', 'Canon', 'Xiaomi'].map((name, i) => <button key={name} className={`brand-word bw-${i}`} onClick={() => { setSearch(name); document.getElementById('new-products')?.scrollIntoView({ behavior: 'smooth' }); }}>{name}</button>)}</div></section>
      <section className="promo-section shop-inner"><div className="promo-heading"><div><span className="eyebrow">ПОДОБРАЛИ ДЛЯ ВАС</span><h2 className="section-title">Спецпредложения</h2></div><span className="promo-aside">Немного больше<br />технологий за свои деньги.</span></div><div className="promo-grid">
        <button className="promo-panel promo-blue" onClick={() => { setSearch('iPhone'); document.getElementById('new-products')?.scrollIntoView({ behavior: 'smooth' }); }}><div className="promo-text"><span className="eyebrow">ВРЕМЯ ОБНОВИТЬСЯ</span><strong>Устройства,<br />которые ближе.</strong><span className="promo-link">Смотреть подборку <ArrowRight size={15} /></span></div><img src={image('reference-025')} alt="Смартфон Samsung" /></button>
        <button className="promo-panel promo-violet" onClick={() => { setSearch('Dyson'); document.getElementById('new-products')?.scrollIntoView({ behavior: 'smooth' }); }}><div className="promo-text"><span className="eyebrow">УМНЫЙ ДОМ</span><strong>Домашняя техника<br />нового уровня.</strong><span className="promo-link">Открыть коллекцию <ArrowRight size={15} /></span></div><img src={image('reference-074')} alt="Техника Dyson для дома" /></button>
      </div></section>
      <footer className="store-footer"><div className="footer-top"><BrandMark compact /><p>Проверенная техника.<br />Понятный сервис.</p><div className="footer-links"><a href="#categories">Каталог</a><a href="#about">О компании</a><a href="#brands">Бренды</a></div><div className="footer-contact"><a href="tel:+78005553535">8 800 555-35-35</a><span>Ежедневно, 9:00–21:00</span></div><Link className="footer-admin" href="/admin">Администратор</Link></div><div className="footer-bottom"><span>© 2025 Техно. Поинт</span><span>Оригинальная техника с гарантией</span><span className="health-indicator"><i className={health.isError ? 'offline' : ''} /> {health.isError ? 'Сервис временно недоступен' : 'Сервис работает'}</span></div></footer>
    </div>
    {cartOpen && <CartDrawer cart={cart} setCart={setCart} close={() => setCartOpen(false)} checkout={() => { setCartOpen(false); setCheckoutOpen(true); }} />}
    {checkoutOpen && <CheckoutDialog cart={cart} onClose={() => setCheckoutOpen(false)} onComplete={() => setCart([])} />}
    {details && <ProductDetails product={details} close={() => setDetails(null)} add={addToCart} />}
  </main>;
}

function AccountPage() {
  return <main className="storefront"><div className="shop-frame"><ShopHeader cartCount={0} onCart={() => {}} /><section className="new-section shop-inner" id="account"><div className="section-head"><div><span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h2 className="section-title">Вход временно отключён</h2></div></div><p style={{ maxWidth: 560 }}>Авторизация через Clerk удалена из проекта, поэтому личный кабинет недоступен. Покупки можно оформлять как гость — через корзину.</p><div style={{ marginTop: 18 }}><Link href="/" className="button-dark">Вернуться в каталог</Link></div></section></div></main>;
}

const adminLinks = [{ href: '/admin', label: 'Обзор', icon: LayoutDashboard }, { href: '/admin/products', label: 'Товары', icon: Boxes }, { href: '/admin/orders', label: 'Заказы', icon: ClipboardList }, { href: '/admin/customers', label: 'Клиенты', icon: Users }];
function AdminShell({ children, current }: { children: ReactNode; current: string }) {
  const [, setLocation] = useLocation();
  return <div className="admin-layout"><aside className="admin-sidebar"><BrandMark compact /><div className="admin-label">УПРАВЛЕНИЕ</div><nav>{adminLinks.map(l => <Link href={l.href} key={l.href} className={`admin-nav-link ${current === l.href ? 'active' : ''}`} data-testid={`nav-${l.label.toLowerCase()}`}><l.icon size={18} />{l.label}{l.href === '/admin/orders' && <span className="nav-dot" />}</Link>)}</nav><div className="sidebar-bottom"><div className="admin-profile"><span className="profile-avatar">ТП</span><span><strong>Техно. Поинт</strong><small>Администратор</small></span></div><button className="signout-button" onClick={() => setLocation('/')}><LogOut size={16} /> Выйти</button><Link className="back-to-store" href="/"><ArrowLeft size={15} /> На витрину</Link></div></aside><main className="admin-main"><header className="admin-topbar"><span>Техно. Поинт <i>/</i> <b>{adminLinks.find(l => l.href === current)?.label}</b></span><Link href="/" className="view-store-link">Открыть витрину <ArrowUpRight size={15} /></Link></header><div className="admin-content">{children}</div></main></div>;
}
function AdminGuard({ current, children }: { current: string; children: ReactNode }) {
  return <AdminShell current={current}>{children}</AdminShell>;
}
function AdminTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) { return <div className="admin-page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>{action}</div>; }
function StatCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof ShoppingBag; tone: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={17} /></span></div><strong>{value}</strong><small>{note}</small></article>;
}
function QueryState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="admin-skeleton"><i /><i /><i /><i /></div>;
  if (error) return <div className="admin-empty"><CircleHelp /><strong>Не удалось загрузить данные</strong><p>Проверьте подключение и попробуйте снова.</p><button onClick={retry}><RefreshCw size={15} /> Повторить</button></div>;
  return <>{children}</>;
}
function AdminDashboard() {
  const { data, isLoading, isError, refetch } = useGetAdminDashboard({ query: { queryKey: getGetAdminDashboardQueryKey() } });
  return <AdminGuard current="/admin"><AdminTitle eyebrow="СВОДКА МАГАЗИНА" title="Обзор" action={<span className="admin-live"><i /> Данные обновляются онлайн</span>} />
    <QueryState loading={isLoading} error={isError} retry={() => refetch()}>{data && <>
      <div className="stats-grid"><StatCard label="Выручка" value={rub(data.totalRevenue)} note="За всё время" icon={ChartNoAxesCombined} tone="purple" /><StatCard label="Заказы" value={String(data.ordersCount)} note={`${data.newOrdersCount} новых заказа`} icon={ClipboardList} tone="blue" /><StatCard label="Клиенты" value={String(data.customersCount)} note="Зарегистрировано в магазине" icon={Users} tone="green" /><StatCard label="Товары" value={String(data.productsCount)} note="В каталоге" icon={Boxes} tone="amber" /></div>
      <div className="dashboard-content-grid"><section className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">ПОСЛЕДНИЕ СОБЫТИЯ</span><h2>Новые заказы</h2></div><Link href="/admin/orders">Все заказы <ArrowRight size={14} /></Link></div><OrdersTable orders={data.recentOrders || []} compact /></section>
        <section className="admin-panel stock-panel"><div className="panel-heading"><div><span className="eyebrow">КАТАЛОГ</span><h2>Состояние склада</h2></div><Link href="/admin/products">Каталог <ArrowRight size={14} /></Link></div><StockSummary /></section></div>
    </>}</QueryState></AdminGuard>;
}
function StockSummary() {
  const { data } = useListAdminProducts();
  const items = data || []; const zero = items.filter(p => p.stock === 0).length; const low = items.filter(p => p.stock > 0 && p.stock < 5).length;
  return <div className="stock-summary"><div className="stock-total"><PackageCheck /><strong>{items.length}</strong><span>товаров в ассортименте</span></div><div className="stock-alerts"><div><i className="stock-red" /><span>Нет в наличии</span><b>{zero}</b></div><div><i className="stock-yellow" /><span>Заканчиваются</span><b>{low}</b></div><div><i className="stock-green" /><span>В наличии</span><b>{items.filter(p => p.stock >= 5).length}</b></div></div></div>;
}
const statusLabels: Record<string, string> = { new: 'Новый', confirmed: 'Подтверждён', shipped: 'Отправлен', completed: 'Выполнен', cancelled: 'Отменён' };
function OrdersTable({ orders, compact = false, onStatus }: { orders: Order[]; compact?: boolean; onStatus?: (o: Order, s: OrderStatus) => void }) {
  if (!orders.length) return <div className="table-empty"><ClipboardList size={22} /><strong>Заказов пока нет</strong><span>Новые заказы появятся здесь.</span></div>;
  return <div className="table-scroll"><table className="admin-table"><thead><tr><th>Заказ</th><th>Клиент</th><th>Дата</th><th>Состав</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>{orders.map(o => <tr key={o.id} data-testid={`row-order-${o.id}`}><td className="order-id">#{String(o.id).padStart(5, '0')}</td><td><strong>{o.customerName}</strong><small>{o.email}</small></td><td>{dateRu(o.createdAt)}</td><td>{o.items?.reduce((n, x) => n + x.quantity, 0) || 0} шт.</td><td className="amount">{rub(o.total)}</td><td>{onStatus && !compact ? <select className={`status-select status-${o.status}`} value={o.status} aria-label={`Статус заказа ${o.id}`} onChange={e => onStatus(o, e.target.value as OrderStatus)}>{Object.entries(statusLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select> : <span className={`status-pill status-${o.status}`}>{statusLabels[o.status] || o.status}</span>}</td></tr>)}</tbody></table></div>;
}
function AdminOrders() {
  const client = useQueryClient(); const [status, setStatus] = useState('');
  const params = useMemo(() => status ? { status: status as OrderStatus } : undefined, [status]);
  const key = getListAdminOrdersQueryKey(params);
  const query = useListAdminOrders(params, { query: { queryKey: key } });
  const update = useUpdateAdminOrder();
  function changeStatus(o: Order, s: OrderStatus) { update.mutate({ id: o.id, data: { status: s } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() }); client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); } }); }
  return <AdminGuard current="/admin/orders"><AdminTitle eyebrow="ЗАКАЗЫ" title="Заказы" action={<label className="select-filter"><SlidersHorizontal size={15} /><select value={status} onChange={e => setStatus(e.target.value)} aria-label="Фильтр заказов"><option value="">Все статусы</option>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><ChevronDown size={14} /></label>} /><QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()}><section className="admin-panel data-panel"><div className="panel-heading"><div><span className="eyebrow">ВСЕ ЗАКАЗЫ</span><h2>{query.data?.length || 0} записей</h2></div>{update.isPending && <span className="saving-label">Сохраняем статус…</span>}</div><OrdersTable orders={query.data || []} onStatus={changeStatus} /></section></QueryState></AdminGuard>;
}

const blankProduct = (): ProductInput => ({ name: '', brand: '', category: '', price: 0, oldPrice: null, imageUrl: '', description: '', stock: 0, badge: '', isNew: false, featured: false });
function ProductEditor({ initial, close, save, pending }: { initial?: Product; close: () => void; save: (data: ProductInput | ProductUpdate) => void; pending: boolean }) {
  const [form, setForm] = useState<ProductInput>(() => initial ? { name: initial.name, brand: initial.brand, category: initial.category, price: initial.price, oldPrice: initial.oldPrice, imageUrl: initial.imageUrl, description: initial.description, stock: initial.stock, badge: initial.badge, isNew: initial.isNew, featured: initial.featured } : blankProduct());
  const [error, setError] = useState('');
  const field = (key: keyof ProductInput, value: string | number | boolean | null) => setForm(prev => ({ ...prev, [key]: value }));
  function submit(e: FormEvent) { e.preventDefault(); if (!form.name.trim() || !form.brand.trim() || !form.category.trim()) { setError('Заполните название, бренд и категорию.'); return; } save(form); }
  return <div className="modal-backdrop"><div className="product-editor modal-scroll" role="dialog" aria-modal="true" aria-label={initial ? 'Редактировать товар' : 'Новый товар'}><div className="modal-heading"><div><span className="eyebrow">КАТАЛОГ</span><h2>{initial ? 'Редактировать товар' : 'Новый товар'}</h2></div><button className="icon-button" onClick={close} aria-label="Закрыть"><X /></button></div>
    <form className="editor-form" onSubmit={submit}><label>Название<input value={form.name} onChange={e => field('name', e.target.value)} required /></label><div className="form-pair"><label>Бренд<input value={form.brand} onChange={e => field('brand', e.target.value)} required /></label><label>Категория<input value={form.category} onChange={e => field('category', e.target.value)} required /></label></div><div className="form-pair"><label>Цена, ₽<input type="number" min="0" value={form.price} onChange={e => field('price', Number(e.target.value))} required /></label><label>Старая цена, ₽<input type="number" min="0" value={form.oldPrice ?? ''} onChange={e => field('oldPrice', e.target.value ? Number(e.target.value) : null)} /></label></div><div className="form-pair"><label>Остаток<input type="number" min="0" value={form.stock} onChange={e => field('stock', Number(e.target.value))} /></label><label>Метка<input value={form.badge || ''} onChange={e => field('badge', e.target.value || null)} placeholder="Новинка, Хит" /></label></div><label>Ссылка на фото<input value={form.imageUrl} onChange={e => field('imageUrl', e.target.value)} placeholder="/images/reference-001.webp" /></label><label>Описание<textarea value={form.description} onChange={e => field('description', e.target.value)} rows={3} /></label><div className="checkbox-row"><label><input type="checkbox" checked={!!form.isNew} onChange={e => field('isNew', e.target.checked)} /> Новинка</label><label><input type="checkbox" checked={!!form.featured} onChange={e => field('featured', e.target.checked)} /> На витрине</label></div>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" className="button-outline" onClick={close}>Отмена</button><button type="submit" className="button-purple" disabled={pending}>{pending ? 'Сохраняем…' : 'Сохранить товар'}</button></div></form></div></div>;
}
function AdminProducts() {
  const client = useQueryClient(); const [editor, setEditor] = useState<Product | 'new' | null>(null); const [search, setSearch] = useState('');
  const query = useListAdminProducts(); const create = useCreateAdminProduct(); const update = useUpdateAdminProduct(); const remove = useDeleteAdminProduct();
  const products = useMemo(() => (query.data || []).filter(p => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  const refresh = () => { client.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }); client.invalidateQueries({ queryKey: getListStoreProductsQueryKey() }); client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); };
  function save(data: ProductInput | ProductUpdate) {
    if (editor === 'new') create.mutate({ data: data as ProductInput }, { onSuccess: () => { setEditor(null); refresh(); } });
    else if (editor) update.mutate({ id: editor.id, data: data as ProductUpdate }, { onSuccess: () => { setEditor(null); refresh(); } });
  }
  function deleteProduct(p: Product) { if (window.confirm(`Удалить «${p.name}» из каталога?`)) remove.mutate({ id: p.id }, { onSuccess: refresh }); }
  const pending = create.isPending || update.isPending;
  return <AdminGuard current="/admin/products"><AdminTitle eyebrow="АССОРТИМЕНТ" title="Товары" action={<button className="button-purple" onClick={() => setEditor('new')} data-testid="button-create-product"><Plus size={16} /> Добавить товар</button>} />
    <QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()}><section className="admin-panel data-panel"><div className="panel-heading"><div><span className="eyebrow">КАТАЛОГ</span><h2>{products.length} товаров</h2></div><label className="admin-search"><Search size={16} /><input placeholder="Название, бренд или категория" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-product-search" /></label></div>
      {products.length ? <div className="table-scroll"><table className="admin-table product-admin-table"><thead><tr><th>Товар</th><th>Категория</th><th>Цена</th><th>На складе</th><th>Витрина</th><th /></tr></thead><tbody>{products.map(p => <tr key={p.id} data-testid={`row-product-${p.id}`}><td><div className="admin-product"><img src={p.imageUrl || image('reference-007')} alt="" /><span><strong>{p.name}</strong><small>{p.brand}</small></span></div></td><td>{p.category}</td><td className="amount">{rub(p.price)}</td><td><span className={`inventory ${p.stock === 0 ? 'out' : p.stock < 5 ? 'low' : ''}`}><i />{p.stock} шт.</span></td><td>{p.featured ? <span className="featured-yes">Да</span> : '—'}</td><td><div className="row-actions"><button onClick={() => setEditor(p)} aria-label={`Редактировать ${p.name}`} data-testid={`button-edit-product-${p.id}`}><Pencil size={15} /></button><button onClick={() => deleteProduct(p)} aria-label={`Удалить ${p.name}`} data-testid={`button-delete-product-${p.id}`}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div> : <div className="table-empty"><Boxes size={22} /><strong>{search ? 'Ничего не найдено' : 'Каталог пуст'}</strong><span>{search ? 'Измените запрос и повторите поиск.' : 'Добавьте первый товар в каталог.'}</span></div>}
    </section></QueryState>{editor && <ProductEditor initial={editor === 'new' ? undefined : editor} close={() => setEditor(null)} save={save} pending={pending} />}
  </AdminGuard>;
}
function CustomerEditor({ customer, close, save, pending }: { customer: Customer; close: () => void; save: (value: CustomerUpdate) => void; pending: boolean }) {
  const [name, setName] = useState(customer.name); const [email, setEmail] = useState(customer.email); const [phone, setPhone] = useState(customer.phone);
  return <div className="modal-backdrop"><div className="customer-editor" role="dialog" aria-modal="true" aria-label="Редактировать клиента"><div className="modal-heading"><div><span className="eyebrow">КЛИЕНТ #{customer.id}</span><h2>Контактные данные</h2></div><button className="icon-button" onClick={close} aria-label="Закрыть"><X /></button></div><form className="editor-form" onSubmit={e => { e.preventDefault(); save({ name, email, phone }); }}><label>Имя<input required value={name} onChange={e => setName(e.target.value)} /></label><label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Телефон<input value={phone} onChange={e => setPhone(e.target.value)} /></label><div className="editor-actions"><button type="button" className="button-outline" onClick={close}>Отмена</button><button className="button-purple" disabled={pending}>{pending ? 'Сохраняем…' : 'Сохранить'}</button></div></form></div></div>;
}
function AdminCustomers() {
  const client = useQueryClient(); const [editing, setEditing] = useState<Customer | null>(null); const [search, setSearch] = useState('');
  const query = useListAdminCustomers(); const update = useUpdateAdminCustomer();
  const customers = useMemo(() => (query.data || []).filter(c => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(search.toLowerCase())), [query.data, search]);
  return <AdminGuard current="/admin/customers"><AdminTitle eyebrow="ПОКУПАТЕЛИ" title="Клиенты" action={<div className="customer-count"><Users size={16} /> {query.data?.length || 0} клиентов</div>} />
    <QueryState loading={query.isLoading} error={query.isError} retry={() => query.refetch()}><section className="admin-panel data-panel"><div className="panel-heading"><div><span className="eyebrow">БАЗА КЛИЕНТОВ</span><h2>Все клиенты</h2></div><label className="admin-search"><Search size={16} /><input placeholder="Поиск по имени, почте или телефону" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-customer-search" /></label></div>
      {customers.length ? <div className="table-scroll"><table className="admin-table"><thead><tr><th>Клиент</th><th>Телефон</th><th>Регистрация</th><th>Заказов</th><th>Потрачено</th><th>Последний заказ</th><th /></tr></thead><tbody>{customers.map(c => <tr key={c.id} data-testid={`row-customer-${c.id}`}><td><div className="customer-cell"><span className="customer-avatar">{c.name.slice(0, 1).toUpperCase()}</span><span><strong>{c.name}</strong><small>{c.email || 'E-mail не указан'}</small></span></div></td><td>{c.phone || '—'}</td><td>{dateRu(c.createdAt)}</td><td>{c.ordersCount}</td><td className="amount">{rub(c.spent)}</td><td>{dateRu(c.lastOrderAt)}</td><td><button className="edit-customer" onClick={() => setEditing(c)} aria-label={`Редактировать ${c.name}`} data-testid={`button-edit-customer-${c.id}`}><Pencil size={15} /></button></td></tr>)}</tbody></table></div> : <div className="table-empty"><Users size={22} /><strong>Клиенты не найдены</strong><span>Проверьте запрос или вернитесь позже.</span></div>}
    </section></QueryState>{editing && <CustomerEditor customer={editing} close={() => setEditing(null)} pending={update.isPending} save={data => update.mutate({ id: editing.id, data }, { onSuccess: () => { setEditing(null); client.invalidateQueries({ queryKey: getListAdminCustomersQueryKey() }); client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); } })} />}</AdminGuard>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function AppRoutes() {
  return <QueryClientProvider client={queryClient}><RoutedErrorBoundary><Switch>
    <Route path="/" component={Storefront} />
    <Route path="/account" component={AccountPage} />
    <Route path="/admin" component={AdminDashboard} /><Route path="/admin/products" component={AdminProducts} /><Route path="/admin/orders" component={AdminOrders} /><Route path="/admin/customers" component={AdminCustomers} />
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary><Toaster /></QueryClientProvider>;
}
function App() {
  return <TooltipProvider><WouterRouter base={basePath}><AppRoutes /></WouterRouter></TooltipProvider>;
}
export default App;
