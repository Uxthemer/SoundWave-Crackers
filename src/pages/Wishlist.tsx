import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Heart, Loader2, ShoppingCart, Trash2, Check } from "lucide-react";
import toast from "react-hot-toast";
import { useWishlistStore, type WishlistItem } from "../store/wishlistStore";
import { useCartStore } from "../store/cartStore";
import { useProducts, type ProductWithCategory } from "../hooks/useProducts";
import { NumberInput } from "../components/NumberInput";
import { crackerImage } from "../lib/productImage";

/**
 * Saved products, ready to go into the cart one at a time or all together.
 *
 * Price and stock come from the live catalog, never from when the product
 * was saved: a wishlist kept over a week must not add last week's price to
 * the cart. A product that has since been withdrawn stays listed, marked, so
 * the customer sees it went rather than wondering where it went.
 */

/** The same product shape Explore Crackers puts in the cart. */
function toCartProduct(row: ProductWithCategory) {
  return {
    id: row.id,
    name: row.name,
    category: row.categories?.name,
    image: row.image_url
      ? row.image_url.split(",").map((img: string) => crackerImage(img.trim()))
      : [`/assets/img/logo/logo-product.png`],
    actual_price: row.actual_price,
    offer_price: row.offer_price,
    discount: row.discount_percentage,
    content: row.content,
    stock: row.stock,
    yt_link: row.yt_link,
    combo_pack_id: row.combo_pack_id ?? null,
  };
}

type Resolved = {
  saved: WishlistItem;
  product: ProductWithCategory | null;
  inCartQty: number;
  outOfStock: boolean;
};

export function Wishlist() {
  const { items: saved, remove, setQuantity, clear } = useWishlistStore();
  const { items: cartItems, addToCart, openCart } = useCartStore();
  const { products, loading } = useProducts();

  const rows: Resolved[] = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return saved.map((item) => {
      const product = byId.get(item.id) ?? null;
      return {
        saved: item,
        product,
        inCartQty: cartItems.find((cartItem) => cartItem.id === item.id)?.quantity ?? 0,
        outOfStock: product != null && Number(product.stock ?? 0) <= 0,
      };
    });
  }, [saved, products, cartItems]);

  /** What "Add all" would actually add: available, in stock, not in the cart yet. */
  const addable = rows.filter((row) => row.product && !row.outOfStock && row.inCartQty === 0);
  const addableTotal = addable.reduce(
    (sum, row) => sum + Number(row.product!.offer_price ?? 0) * row.saved.quantity,
    0
  );

  const addOne = (row: Resolved) => {
    if (!row.product || row.outOfStock) return;
    addToCart(toCartProduct(row.product) as any, row.saved.quantity);
    toast.success(`${row.product.name} added to cart`, { id: `wl-add-${row.saved.id}` });
  };

  const addAll = () => {
    if (addable.length === 0) return;
    addable.forEach((row) => addToCart(toCartProduct(row.product!) as any, row.saved.quantity));

    // Say what was left out and why, rather than silently skipping.
    const skipped = rows.length - addable.length;
    toast.success(
      `${addable.length} item${addable.length === 1 ? "" : "s"} added to cart` +
        (skipped > 0 ? ` · ${skipped} skipped (already in cart or unavailable)` : ""),
      { duration: 4000 }
    );
    openCart();
  };

  if (saved.length === 0) {
    return (
      <div className="min-h-screen pt-16 pb-12">
        <div className="container mx-auto px-6 text-center max-w-md">
          <Heart className="w-14 h-14 mx-auto mb-4 text-primary-red/60" />
          <h1 className="font-heading text-3xl mb-2">Your wishlist is empty</h1>
          <p className="text-text/70 mb-6">
            Tap the ♡ on any product to save it here. Come back any time and
            add everything to your cart in one click.
          </p>
          <Link to="/buy-cracker-online" className="btn-primary inline-block">
            Explore Crackers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-3 md:px-6 max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 fill-primary-red text-primary-red" />
            <h1 className="font-heading text-4xl">My Wishlist</h1>
            <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full text-sm">
              {saved.length} item{saved.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                if (confirm("Remove everything from your wishlist?")) clear();
              }}
              className="px-4 py-2 rounded-lg bg-card border border-card-border/10 hover:bg-card/70 text-sm"
            >
              Clear wishlist
            </button>
            <button
              onClick={addAll}
              disabled={loading || addable.length === 0}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                addable.length === 0
                  ? "Everything here is already in your cart or unavailable"
                  : undefined
              }
            >
              <ShoppingCart className="w-5 h-5" />
              <span>
                Add all to cart
                {addable.length > 0 && ` (${addable.length}) · ₹${addableTotal.toFixed(2)}`}
              </span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const { saved: item, product } = row;
              const image = product?.image_url
                ? crackerImage(product.image_url.split(",")[0].trim())
                : item.image || "/assets/img/logo/logo-product.png";
              const price = Number(product?.offer_price ?? item.offer_price);

              return (
                <div
                  key={item.id}
                  className={`card p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                    !product ? "opacity-60" : ""
                  }`}
                >
                  <Link
                    to={product ? `/product/${item.id}` : "#"}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <img
                      src={image}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded-lg shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="font-montserrat font-bold truncate">
                        {product?.name ?? item.name}
                      </h3>
                      <p className="text-xs text-text/60 truncate">
                        {product?.content}
                        {(product?.combo_pack_id || item.is_pack) && " · Family pack"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {product && Number(product.actual_price) > price && (
                          <span className="text-xs text-text/50 line-through">
                            ₹{Number(product.actual_price).toFixed(2)}
                          </span>
                        )}
                        <span className="font-bold text-primary-orange">
                          ₹{price.toFixed(2)}
                        </span>
                        {!product && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                            No longer available
                          </span>
                        )}
                        {row.outOfStock && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            Out of stock
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 sm:justify-end">
                    <label className="flex items-center gap-1.5 text-sm text-text/70">
                      Qty
                      <NumberInput
                        min={1}
                        value={item.quantity}
                        onValueChange={(n) => setQuantity(item.id, n)}
                        aria-label={`Quantity of ${item.name}`}
                        className="w-16 px-2 py-1.5 text-center rounded-lg bg-background border border-card-border/10 focus:outline-none focus:border-primary-orange"
                      />
                    </label>

                    {row.inCartQty > 0 ? (
                      <button
                        onClick={openCart}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-green-50 text-green-700 border border-green-600/30 hover:bg-green-100 whitespace-nowrap"
                        title="Already in your cart — open the cart to change it"
                      >
                        <Check className="w-4 h-4" />
                        In cart ({row.inCartQty})
                      </button>
                    ) : (
                      <button
                        onClick={() => addOne(row)}
                        disabled={!product || row.outOfStock}
                        className="btn-primary flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Add to cart
                      </button>
                    )}

                    <button
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${item.name} from wishlist`}
                      title="Remove from wishlist"
                      className="p-2 rounded-lg text-red-500 hover:bg-card/70"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
