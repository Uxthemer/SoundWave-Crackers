import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  Download,
  Upload,
  Printer,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { BulkImportModal } from "../components/BulkImportModal";
import * as XLSX from "xlsx";
import { useProducts } from "../hooks/useProducts";
import { useSeasons, useSeasonActions } from "../context/SeasonContext";

interface Product {
  id: string;
  name: string;
  category_id: string;
  stock: number;
  actual_price: number;
  offer_price: number;
  content: string;
  discount_percentage: string;
  image_url: string;
  description: string;
  product_code?: string;
  categories?: {
    name: string;
  };
  apr?: string;
  order?: number;
  is_active?: boolean;
  yt_link?: string;
  /** Set when the row came from the season catalog. */
  season_id?: string;
  product_season_id?: string;
}

interface Category {
  id: string;
  name: string;
  order?: number;
}

/**
 * States which season a product form writes to.
 *
 * The season selector is remembered across visits, so someone can open this
 * page days later and add a product to a draft season without realising it.
 * Price, stock and cost land in the named season only — every other season is
 * unaffected.
 */
function SeasonTargetNotice({
  seasonName,
  isLive,
}: {
  seasonName: string | undefined;
  isLive: boolean;
}) {
  if (isLive) {
    return (
      <p className="text-sm text-text/70 text-center mb-4">
        Saving to{" "}
        <span className="font-semibold text-primary-orange">
          season {seasonName ?? "—"}
        </span>{" "}
        (live). Other seasons are unaffected.
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
      <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
        Saving to season {seasonName ?? "—"} — this is not the live season
      </p>
      <p className="text-xs text-text/70 mt-1">
        Customers will not see this until that season is made live. Switch the
        season selector to change where it is saved.
      </p>
    </div>
  );
}

export function StockManagement() {
  const {
    seasons,
    selectedSeason,
    selectedSeasonId,
    setSelectedSeasonId,
    isSelectedReadOnly,
    loading: seasonsLoading,
  } = useSeasons();
  const { setSeasonUnlocked } = useSeasonActions();
  const { exportProductsToExcel } = useProducts(selectedSeasonId);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<Partial<Product>>({});
  const [sortField, setSortField] = useState<string>("order");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { userRole } = useAuth();

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedSeasonId) fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasonId]);

  const fetchProducts = async () => {
    if (!selectedSeasonId) return;
    try {
      setLoading(true);

      // Cost price lives in its own admin-only table, so it is fetched
      // separately and merged in rather than exposed through the public view.
      const [catalogRes, costsRes] = await Promise.all([
        supabase
          .from("season_catalog")
          .select("*")
          .eq("season_id", selectedSeasonId)
          .order("order", { nullsFirst: false })
          .order("name"),
        supabase
          .from("product_season_costs")
          .select("product_id, apr")
          .eq("season_id", selectedSeasonId),
      ]);

      if (catalogRes.error) throw catalogRes.error;
      if (costsRes.error) throw costsRes.error;

      const aprByProduct = new Map(
        (costsRes.data || []).map((c: any) => [c.product_id, c.apr])
      );

      setProducts(
        (catalogRes.data || []).map((row: any) => ({
          ...row,
          apr: aprByProduct.get(row.id) ?? "",
        }))
      );
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("order"); // <-- order by category order

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setEditForm(product);
    setEditModalOpen(true);
  };

  const handleEditModalClose = () => {
    setEditModalOpen(false);
    setEditingProduct(null);
    setEditForm({});
  };

  const handleEditModalSave = async () => {
    if (!editingProduct || !selectedSeasonId) return;
    if (isSelectedReadOnly) {
      alert(
        "This season is closed and read-only. A superadmin must unlock it first."
      );
      return;
    }

    try {
      // Identity — shared across every season.
      const { error: identityError } = await supabase
        .from("products")
        .update({
          category_id: editForm.category_id,
          name: editForm.name,
          image_url: editForm.image_url,
          description: editForm.description,
          yt_link: editForm.yt_link,
          product_code: editForm.product_code,
        })
        .eq("id", editingProduct.id);

      if (identityError) throw identityError;

      // Commercials — this season only.
      const { error: seasonError } = await supabase
        .from("product_seasons")
        .update({
          stock: Number(editForm.stock ?? 0),
          actual_price: Number(editForm.actual_price ?? 0),
          offer_price: Number(editForm.offer_price ?? 0),
          content: editForm.content,
          discount_percentage: Number(editForm.discount_percentage ?? 0),
          is_active: editForm.is_active,
          display_order: editForm.order,
        })
        .eq("product_id", editingProduct.id)
        .eq("season_id", selectedSeasonId);

      if (seasonError) throw seasonError;

      // Cost price — separate admin-only table.
      const { error: costError } = await supabase
        .from("product_season_costs")
        .upsert(
          {
            season_id: selectedSeasonId,
            product_id: editingProduct.id,
            apr: editForm.apr ? Number(Number(editForm.apr).toFixed(2)) : null,
          },
          { onConflict: "season_id,product_id" }
        );

      if (costError) throw costError;

      setEditModalOpen(false);
      setEditingProduct(null);
      setEditForm({});
      fetchProducts();
    } catch (error) {
      console.error("Error updating product:", error);
      alert(
        error instanceof Error ? error.message : "Failed to update product"
      );
    }
  };

  const getPriceListExportRows = () => {
    const grouped: { [cat: string]: Product[] } = {};

    filteredProducts
      .filter((product) => product.is_active !== false)
      .forEach((product) => {
        const catName = product.categories?.name || "Uncategorized";
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(product);
      });

    Object.keys(grouped).forEach((cat) => {
      grouped[cat].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    const categoryOrderMap: Record<string, number> = {};
    categories.forEach((cat) => {
      categoryOrderMap[cat.name] = cat.order ?? 0;
    });

    const sortedCategoryNames = Object.keys(grouped).sort(
      (a, b) => (categoryOrderMap[a] ?? 0) - (categoryOrderMap[b] ?? 0)
    );

    const rows: Record<string, string | number>[] = [];
    let serial = 1;

    sortedCategoryNames.forEach((catName) => {
      grouped[catName].forEach((product) => {
        rows.push({
          "S.No": serial++,
          Category: catName,
          Product: product.name,
          "Actual Price": product.actual_price,
          "Offer Price": product.offer_price,
          Content: product.content || "-",
          Stock: product.stock ?? 0,
          APR: product.apr || "-",
        });
      });
    });

    return rows;
  };

  // Archived seasons export under their own name so old price lists stay
  // distinguishable from the current one.
  const seasonSlug = (selectedSeason?.name || "current").replace(/\s+/g, "-");

  const handleExportPriceList = (format: "excel" | "csv") => {
    const rows = getPriceListExportRows();

    if (!rows.length) return;

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Price List");

    if (format === "csv") {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `soundwave_price_list_${seasonSlug}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }

    XLSX.writeFile(workbook, `soundwave_price_list_${seasonSlug}.xlsx`);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Group products by category and sort products by order inside each category
    const grouped: { [cat: string]: Product[] } = {};
    filteredProducts.forEach((product) => {
      const catName = product.categories?.name || "Uncategorized";
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(product);
    });

    // Sort products inside each category by product.order
    Object.keys(grouped).forEach((cat) => {
      grouped[cat].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    // Get category order mapping from categories state
    const categoryOrderMap: Record<string, number> = {};
    categories.forEach((cat) => {
      categoryOrderMap[cat.name] = cat.order ?? 0;
    });

    // Sort categories by category order
    const sortedCategoryNames = Object.keys(grouped).sort(
      (a, b) => (categoryOrderMap[a] ?? 0) - (categoryOrderMap[b] ?? 0)
    );

    // Generate table rows
    let tableRows = "";
    let serial = 1;
    sortedCategoryNames.forEach((catName) => {
      const products = grouped[catName];
      // Category row
      tableRows += `
      <tr>
        <td colspan="7" style="text-align:center; font-weight:bold; background:#f5f5f5; font-size:1.1rem;">
          ${catName}
        </td>
      </tr>
    `;
      // Product rows
      products.forEach((product) => {
        tableRows += `
        <tr class="${product.is_active ? "" : "text-red-500 font-bold"}">
          <td>${serial++}</td>
          <td>${product.name}</td>
          <td>${product.content || "-"}</td>
          <td class="${product.stock <= 20 ? "text-red-500 font-bold" : ""}">${
          product.stock
        }</td>
          <td><del>₹${product.actual_price}</del></td>
          <td>₹${product.offer_price}</td>
          <td>${product.apr || "-"}</td>
        </tr>
      `;
      });
    });

    const content = `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Soundwave Crackers - Stock Report ${seasonSlug}</title>
  <style>
    body {
      margin: 0;
      font-family: sans-serif, "Segoe UI";
      background-color: #fff0f5;
      color: #333;
    }
    .table-section {
      padding: 20px;
    }
    .table-overlay {
      background-color: rgba(255, 255, 255, 0.88);
      padding: 30px;
      border-radius: 12px;
      margin: auto;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    }
    table.product-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    table.product-table th,
    table.product-table td {
      border: 1px solid #999;
      padding: 12px 15px;
      text-align: center;
    }
    table.product-table th {
      background-color: brown;
      font-weight: bold;
      color: wheat;
    }
    .text-red-500 {
      color: #FF0000 !important;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <section class="table-section">
    <div class="table-overlay">
      <table class="product-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Product</th>
            <th>Content</th>
            <th>Stock</th>
            <th>Actual Price</th>
            <th>Offer Price</th>
            <th>APR</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  </section>
  <footer style="text-align: center; padding: 20px; font-size: 0.9rem; color: #666;">
    <p><strong>Soundwave Crackers</strong> - Your premier destination for premium-quality crackers and fireworks, making your celebrations brighter and more memorable.</p>
    <p>Thank you for choosing Soundwave Crackers! For inquiries, contact us</p>
  </footer>
  <script>
    // Wait for DOM to be loaded before printing
    function readyToPrint() {
      setTimeout(function() {
        window.print();
        window.close();
      }, 300);
    }
    if (document.readyState === "complete") {
      readyToPrint();
    } else {
      window.onload = readyToPrint;
    }
  </script>
</body>
</html>
  `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handlePriceListDownload1 = async () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const content = `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Soundwave Crackers - Price List ${seasonSlug}</title>
  <style>
    body {
      margin: 0;
      font-family: sans-serif, "Segoe UI";
      background-color: #fff0f5;
      color: #333;
    }

    header {
      text-align: center;
      padding: 20px 20px 0px 20px;
      // background: url("/assets/img/banners/CTA-banner.png") center center / cover no-repeat;
      color: white;
      
    }

    header img {
      height: 100px;
      margin-bottom: 10px;
    }

    header h1 {
      margin: 10px 0 5px;
      font-size: 2.5rem;
      font-weight: bold;
    }

    header p.slogan {
      font-style: italic;
      font-size: 1rem;
      margin: 0px 10px;
    }

    header .contact {
      font-size: 0.95rem;
      line-height: 1.6;
      text-align: end;
    }

    header .content {
      background: brown;
      padding: 20px;
      border-radius: 12px;
    }

    header .company-info {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
     
    }
    header .company-header-section {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    }

    .table-section {
      // background: url("/assets/img/banners/CTA-banner.png") center center / cover no-repeat;
      padding: 20px;
    }

    .table-overlay {
      background-color: rgba(255, 255, 255, 0.88);
      padding: 30px;
      border-radius: 12px;

      margin: auto;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    }

    table.product-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }

    table.product-table th,
    table.product-table td {
      border: 1px solid #999;
      padding: 12px 15px;
      text-align: center;
    }

    table.product-table th {
      background-color: brown;
      font-weight: bold;
      color: wheat;
    }
  </style>
</head>

<body>
  <header>
    <div class="content">
      <div class="company-info">
        <img src="/assets/img/logo/logo_2.png" alt="Soundwave Crackers Logo" />
        <div class="contact">
          <p>📍 Kananjampatti, Sattur-Sivakasi-Kalugumalai Road,<br />Vembakottai, Sivakasi, Tamil Nadu, 626131</p>
          <p>
            📞 +91 9363515184 | 💬
            <a href="https://wa.me/919363515184" target="_blank" style="color: white">WhatsApp Us</a>
            | 📞 +91 9789794518
          </p>
          <p>
            🌐
            <a href="https://soundwavecrackers.com" target="_blank" style="color: white">www.soundwavecrackers.com</a>
          </p>
        </div>
      </div>
      <div class="company-header-section">
        <!-- <div> <img src="gift-box-new.png" alt="upto 80% off" /></div> -->
        <div class="brand-info">
          <h1>Soundwave Crackers</h1>
          <p class="slogan">"The Rhythm Of Celebration"</p>
          <p>📅 Price List - 2025</p>
          <p><strong>Upto 80% Off</strong></p>
        </div>
        <!-- <div> <img src="gift-box-new.png" alt="upto 80% off" /></div> -->
      </div>
  </header>

  <section class="table-section">
    <div class="table-overlay">
      <table class="product-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Category</th>
            <th>Product</th>
            <th>Actual Price</th>
            <th>Offer Price</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${filteredProducts
            .map(
              (product, index) => `
              <tr>
              <td>${index + 1}</td>
              <td>${product.categories?.name || "-"}</td>
                <td class="text-left">${product.name}</td>
                <td>₹${product.actual_price}</td>
                <td>₹${product.offer_price}</td>
                <td>${product.content || "-"}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </section>
  <footer style="text-align: center; padding: 20px; font-size: 0.9rem; color: #666;">
  <p><strong>Soundwave Crackers</strong> - Your premier destination for premium-quality crackers and fireworks, making your celebrations brighter and more memorable.</p>
    <p>Thank you for choosing Soundwave Crackers! For inquiries, contact us</p>
  </footer>
</body>
</html>
  `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handlePriceListDownload = async () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Filter products based on active status
    const filteredProducts = products.filter((product) => product.is_active);

    // Group products by category and sort products by order inside each category
    const grouped: { [cat: string]: Product[] } = {};
    filteredProducts.forEach((product) => {
      const catName = product.categories?.name || "Uncategorized";
      if (!grouped[catName]) grouped[catName] = [];
      grouped[catName].push(product);
    });

    // Sort products inside each category by product.order
    Object.keys(grouped).forEach((cat) => {
      grouped[cat].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    // Get category order mapping from categories state
    const categoryOrderMap: Record<string, number> = {};
    categories.forEach((cat) => {
      categoryOrderMap[cat.name] = cat.order ?? 0;
    });

    // Sort categories by category order
    const sortedCategoryNames = Object.keys(grouped).sort(
      (a, b) => (categoryOrderMap[a] ?? 0) - (categoryOrderMap[b] ?? 0)
    );

    // Generate table rows
    let tableRows = "";
    let serial = 1;
    sortedCategoryNames.forEach((catName) => {
      const products = grouped[catName];
      // Category row
      tableRows += `
      <tr>
        <td colspan="5" style="text-align:center; font-weight:bold; background:#f5f5f5; font-size:1.1rem;">
          ${catName}
        </td>
      </tr>
    `;
      // Product rows
      products.forEach((product) => {
        tableRows += `
        <tr>
          <td>${serial++}</td>
          <td class="text-align-left">${product.name}</td>
          <td><del>₹${product.actual_price}</del></td>
          <td>₹${product.offer_price}</td>
          <td>${product.content || "-"}</td>
        </tr>
      `;
      });
    });

    const content = `
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Soundwave Crackers - Price List ${seasonSlug}</title>
  <style>
    body {
      margin: 0;
      font-family: sans-serif, "Segoe UI";
      background-color: #fff0f5;
      color: #333;
    }
    .header-image {
      width: 100%;
      max-height: 400px;
      display: block;
      margin: 0 auto;
      border-radius: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    }
    .table-overlay {
      background-color: rgba(255, 255, 255, 0.88);
      padding: 20px 6px;
      border-radius: 12px;
      margin: auto;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    }
    table.product-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.75rem;
      font-weight: 400;
    }
    table.product-table th,
    table.product-table td {
      border: 1px solid #999;
      padding: 5px 8px;
      text-align: center;
    }
    table.product-table td.text-align-left {
      text-align: left;
    }
    table.product-table th {
      background-color: brown;
      font-weight: bold;
      color: wheat;
    }
  </style>
</head>
<body>
  <header>
    <img src="/assets/img/banners/price-list-header.png" alt="Soundwave Crackers Banner" class="header-image" />
  </header>
  <section class="table-section">
    <div class="table-overlay">
      <table class="product-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Product</th>
            <th>Actual Price</th>
            <th>Offer Price</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  </section>
  <footer style="text-align: center; padding: 20px; font-size: 0.9rem; color: #666;">
    <p><strong>Soundwave Crackers</strong> - Your premier destination for premium-quality crackers and fireworks, making your celebrations brighter and more memorable.</p>
    <p>Thank you for choosing Soundwave Crackers! For inquiries, contact us</p>
  </footer>
  <script>
    // Wait for all images and DOM to be loaded before printing
    function readyToPrint() {
      const img = document.querySelector('.header-image');
      if (img && !img.complete) {
        img.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 300);
        };
      } else {
        setTimeout(function() {
          window.print();
          window.close();
        }, 300);
      }
    }
    if (document.readyState === "complete") {
      readyToPrint();
    } else {
      window.onload = readyToPrint;
    }
  </script>
</body>
</html>
  `;

    printWindow.document.write(content);
    printWindow.document.close();
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || product.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // count of active products within current filtered list
  const activeCount = filteredProducts.filter((p) => p.is_active).length;

  // Add sorting handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Helper to safely get the value for sorting
  const getSortValue = (
    product: Product,
    field: string
  ): string | number | boolean => {
    switch (field) {
      case "order":
        return product.order ?? 0;
      case "product_code":
        // @ts-ignore
        return (product as any).product_code ?? "";
      case "name":
        return product.name ?? "";
      case "categories.name":
        return product.categories?.name ?? "";
      case "content":
        return product.content ?? "";
      case "stock":
        return product.stock ?? 0;
      case "actual_price":
        return product.actual_price ?? 0;
      case "offer_price":
        return product.offer_price ?? 0;
      case "apr":
        return product.apr ?? "";
      case "is_active":
        return product.is_active ?? false;
      default:
        // fallback for any other field
        // @ts-ignore
        return (product as any)[field] ?? "";
    }
  };

  // Sort products based on selected field and direction
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const aValue = getSortValue(a, sortField);
    const bValue = getSortValue(b, sortField);

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    }
    if (typeof aValue === "boolean" && typeof bValue === "boolean") {
      return sortDirection === "asc"
        ? Number(aValue) - Number(bValue)
        : Number(bValue) - Number(aValue);
    }
    return sortDirection === "asc"
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });


  if (!userRole) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-orange" />
      </div>
    );
  }

  if (!["admin", "superadmin"].includes(userRole?.name || "")) {
    return (
      <div className="min-h-screen pt-24 pb-12">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
            <p>You don't have permission to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-8 pb-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="font-heading text-4xl">Stock Management</h1>
            <div className="flex gap-2 items-center">
              <span className="bg-primary-orange/10 text-primary-orange px-3 py-1 rounded-full">
                {filteredProducts.length} products
              </span>
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full">
                {activeCount} active
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
            {/* Which season's prices and stock are being viewed/edited. */}
            <select
              value={selectedSeasonId ?? ""}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              disabled={seasonsLoading || seasons.length === 0}
              aria-label="Season"
              className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange w-full sm:w-auto"
            >
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  Season {season.name}
                  {season.status === "active"
                    ? " (live)"
                    : season.status === "draft"
                    ? " (draft)"
                    : " (closed)"}
                </option>
              ))}
            </select>
            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text/60" />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 rounded-lg bg-card border border-card-border/10 focus:outline-none focus:border-primary-orange w-full sm:w-auto"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Closed seasons are frozen. The database enforces this too — the
            banner just explains why the buttons are disabled. */}
        {isSelectedReadOnly && selectedSeason && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                Season {selectedSeason.name} is closed and read-only
              </p>
              <p className="text-sm text-text/70">
                Prices, stock and cost for this season are frozen as an archive.
                Switch to the live season to make changes.
              </p>
            </div>
            {userRole?.name === "superadmin" && (
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      `Unlock season ${selectedSeason.name} for editing? This is recorded in the audit log.`
                    )
                  )
                    return;
                  try {
                    await setSeasonUnlocked(selectedSeason.id, true);
                  } catch (err) {
                    alert(
                      err instanceof Error ? err.message : "Failed to unlock"
                    );
                  }
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap"
              >
                Unlock for editing
              </button>
            )}
          </div>
        )}

        {selectedSeason?.status === "closed" && selectedSeason.is_unlocked && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="font-semibold text-red-600">
              Season {selectedSeason.name} is unlocked — you are editing
              archived data.
            </p>
            {userRole?.name === "superadmin" && (
              <button
                onClick={() => setSeasonUnlocked(selectedSeason.id, false)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                Re-lock season
              </button>
            )}
          </div>
        )}

        {selectedSeason?.status === "draft" && (
          <div className="mb-6 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3">
            <p className="font-semibold text-blue-700 dark:text-blue-400">
              Season {selectedSeason.name} is a draft
            </p>
            <p className="text-sm text-text/70">
              Edits here are not visible to customers. Activate the season on the
              Seasons page when you are ready to sell from it.
            </p>
          </div>
        )}

        {/* Responsive Button Group */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6 w-full">
          <button
            onClick={() => setShowImportModal(true)}
            disabled={isSelectedReadOnly}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="w-5 h-5" />
            <span>Bulk Import</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors w-full sm:w-auto"
          >
            <Printer className="w-5 h-5" />
            <span>Print Stock Report</span>
          </button>
          <button
            onClick={handlePriceListDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors w-full sm:w-auto"
          >
            <Printer className="w-5 h-5" />
            <span>Price List</span>
          </button>
          <button
            onClick={() => handleExportPriceList("excel")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors w-full sm:w-auto"
          >
            <Download className="w-5 h-5" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={() => handleExportPriceList("csv")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors w-full sm:w-auto"
          >
            <Download className="w-5 h-5" />
            <span>Export CSV</span>
          </button>
          {["admin", "superadmin"].includes(userRole?.name || "") && (
            <button
              onClick={() => setShowAddModal(true)}
              disabled={isSelectedReadOnly}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
              <span>Add Product</span>
            </button>
          )}
          <button
            onClick={exportProductsToExcel}
            className="flex items-center gap-2 bg-card border border-card-border/10 rounded-lg px-4 py-2 hover:bg-card/70 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Products</span>
          </button>
        </div>

        <div className="bg-card/30 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-card/50">
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("order")}
                  >
                    <span className="flex items-center gap-1">
                      Order
                      {sortField === "order" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("product_code")}
                  >
                    <span className="flex items-center gap-1">
                      Product Code
                      {sortField === "product_code" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("name")}
                  >
                    <span className="flex items-center gap-1">
                      Product Name
                      {sortField === "name" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("categories.name")}
                  >
                    <span className="flex items-center gap-1">
                      Category
                      {sortField === "categories.name" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("content")}
                  >
                    <span className="flex items-center gap-1">
                      Content
                      {sortField === "content" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("stock")}
                  >
                    <span className="flex items-center gap-1">
                      Stock
                      {sortField === "stock" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("actual_price")}
                  >
                    <span className="flex items-center gap-1">
                      Actual Price
                      {sortField === "actual_price" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("offer_price")}
                  >
                    <span className="flex items-center gap-1">
                      Offer Price
                      {sortField === "offer_price" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  {userRole?.name === "superadmin" && (
                    <th
                      className="py-4 px-6 text-left cursor-pointer"
                      onClick={() => handleSort("apr")}
                    >
                      <span className="flex items-center gap-1">
                        APR
                        {sortField === "apr" &&
                          (sortDirection === "asc" ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          ))}
                      </span>
                    </th>
                  )}
                  <th
                    className="py-4 px-6 text-left cursor-pointer"
                    onClick={() => handleSort("is_active")}
                  >
                    <span className="flex items-center gap-1">
                      Active
                      {sortField === "is_active" &&
                        (sortDirection === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </span>
                  </th>
                  {userRole?.name === "superadmin" && (
                    <th className="py-4 px-6 text-center">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-text/60">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : sortedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-text/60">
                      No products found
                    </td>
                  </tr>
                ) : (
                  sortedProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="border-t border-card-border/10"
                    >
                      <td className="py-4 px-6">{product.order ?? "-"}</td>
                      <td className="py-4 px-6">
                        {product.product_code || "-"}
                      </td>
                      <td className="py-4 px-6">{product.name}</td>
                      <td className="py-4 px-6">{product.categories?.name}</td>
                      <td className="py-4 px-6">{product.content}</td>
                      <td
                        className={`py-4 px-6 ${
                          product.stock <= 20 ? "text-red-500 font-bold" : ""
                        }`}
                      >
                        {product.stock}
                      </td>
                      <td className="py-4 px-6">₹{product.actual_price}</td>
                      <td className="py-4 px-6">₹{product.offer_price}</td>
                      {userRole?.name === "superadmin" && (
                        <td className="py-4 px-6">{product.apr || "-"}</td>
                      )}
                      <td className="py-4 px-6">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            product.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {product.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {userRole?.name === "superadmin" && (
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleEdit(product)}
                              disabled={isSelectedReadOnly}
                              title={
                                isSelectedReadOnly
                                  ? "This season is closed and read-only"
                                  : "Edit product"
                              }
                              className="p-2 text-primary-orange hover:bg-card/70 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editModalOpen && (
        <>
          {/* Prevent background scroll when modal is open */}
          <style>{`
            body { overflow: hidden !important; }
          `}</style>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
              className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-xl mx-2 relative overflow-y-auto"
              style={{ maxHeight: "90vh" }}
            >
              <button
                className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
                onClick={handleEditModalClose}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="text-2xl font-bold mb-2 text-center">
                Edit Product
              </h2>
              <SeasonTargetNotice
                seasonName={selectedSeason?.name}
                isLive={selectedSeason?.status === "active"}
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleEditModalSave();
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 font-medium">
                      Product Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      required
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      Product Code
                    </label>
                    <input
                      type="text"
                      value={editForm.product_code || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          product_code: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Product Code"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Category</label>
                    <select
                      value={editForm.category_id || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          category_id: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      required
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Content</label>
                    <input
                      type="text"
                      value={editForm.content || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, content: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Stock</label>
                    <input
                      type="number"
                      value={editForm.stock ?? ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          stock: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      Actual Price
                    </label>
                    <input
                      type="number"
                      value={editForm.actual_price ?? ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          actual_price: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      Offer Price
                    </label>
                    <input
                      type="number"
                      value={editForm.offer_price ?? ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          offer_price: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">APR</label>
                    <input
                      type="text"
                      value={editForm.apr || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, apr: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="APR"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Image URL</label>
                    <input
                      type="text"
                      value={editForm.image_url || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          image_url: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Image URL"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Discount %</label>
                    <input
                      type="text"
                      value={editForm.discount_percentage || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          discount_percentage: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Discount %"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1 font-medium">
                      Description
                    </label>
                    <textarea
                      value={editForm.description || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Description"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Active</label>
                    <select
                      value={editForm.is_active ? "true" : "false"}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          is_active: e.target.value === "true",
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      YouTube Video ID
                    </label>
                    <input
                      type="text"
                      value={editForm.yt_link || ""}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, yt_link: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="YouTube Link"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Order</label>
                    <input
                      type="number"
                      value={editForm.order ?? ""}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          order: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                  <button
                    type="button"
                    onClick={handleEditModalClose}
                    className="px-6 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <>
          {/* Prevent background scroll when modal is open */}
          <style>{`body { overflow: hidden !important; }`}</style>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
              className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-xl mx-2 relative overflow-y-auto"
              style={{ maxHeight: "90vh" }}
            >
              <button
                className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-2xl"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="text-2xl font-bold mb-2 text-center">
                Add Product
              </h2>
              <SeasonTargetNotice
                seasonName={selectedSeason?.name}
                isLive={selectedSeason?.status === "active"}
              />
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!selectedSeasonId) return;
                  if (isSelectedReadOnly) {
                    alert(
                      "This season is closed and read-only. A superadmin must unlock it first."
                    );
                    return;
                  }
                  try {
                    // 1. Identity row, shared across seasons.
                    const { data: created, error } = await supabase
                      .from("products")
                      .insert({
                        name: addForm.name,
                        category_id: addForm.category_id,
                        image_url: addForm.image_url,
                        description: addForm.description,
                        product_code: addForm.product_code || "",
                        yt_link: addForm.yt_link || "",
                      })
                      .select("id")
                      .single();
                    if (error) throw error;

                    // 2. Commercials for the season being worked on.
                    const { error: seasonError } = await supabase
                      .from("product_seasons")
                      .insert({
                        season_id: selectedSeasonId,
                        product_id: created.id,
                        actual_price: Number(addForm.actual_price ?? 0),
                        offer_price: Number(addForm.offer_price ?? 0),
                        discount_percentage: Number(
                          addForm.discount_percentage ?? 0
                        ),
                        content: addForm.content,
                        opening_stock: Number(addForm.stock ?? 0),
                        stock: Number(addForm.stock ?? 0),
                        display_order: addForm.order,
                        is_active:
                          addForm.is_active !== undefined
                            ? addForm.is_active
                            : true,
                      });
                    if (seasonError) throw seasonError;

                    // 3. Cost price.
                    if (addForm.apr) {
                      const { error: costError } = await supabase
                        .from("product_season_costs")
                        .insert({
                          season_id: selectedSeasonId,
                          product_id: created.id,
                          apr: Number(Number(addForm.apr).toFixed(2)),
                        });
                      if (costError) throw costError;
                    }

                    setShowAddModal(false);
                    setAddForm({});
                    fetchProducts();
                  } catch (err) {
                    alert(
                      err instanceof Error
                        ? err.message
                        : "Failed to add product"
                    );
                  }
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-1 font-medium">
                      Product Name
                    </label>
                    <input
                      type="text"
                      value={addForm.name || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      Product Code
                    </label>
                    <input
                      type="text"
                      value={addForm.product_code || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          product_code: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Product Code"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Category</label>
                    <select
                      value={addForm.category_id || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          category_id: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      required
                    >
                      <option value="">Select</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Content</label>
                    <input
                      type="text"
                      value={addForm.content || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, content: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Stock</label>
                    <input
                      type="number"
                      value={addForm.stock ?? ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          stock: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      Actual Price
                    </label>
                    <input
                      type="number"
                      value={addForm.actual_price ?? ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          actual_price: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">
                      Offer Price
                    </label>
                    <input
                      type="number"
                      value={addForm.offer_price ?? ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          offer_price: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">APR</label>
                    <input
                      type="text"
                      value={addForm.apr || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, apr: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="APR"
                      disabled={userRole?.name !== "superadmin"}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Order</label>
                    <input
                      type="number"
                      value={addForm.order ?? ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          order: Number(e.target.value),
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      min={0}
                      placeholder="Order"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Image URL</label>
                    <input
                      type="text"
                      value={addForm.image_url || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, image_url: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Image URL"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Discount %</label>
                    <input
                      type="text"
                      value={addForm.discount_percentage || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          discount_percentage: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Discount %"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block mb-1 font-medium">
                      Description
                    </label>
                    <textarea
                      value={addForm.description || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Description"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium">Active</label>
                    <select
                      value={
                        addForm.is_active !== undefined
                          ? String(addForm.is_active)
                          : "true"
                      }
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          is_active: e.target.value === "true",
                        }))
                      }
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      YouTube Video ID
                    </label>
                    <input
                      type="text"
                      value={addForm.yt_link || ""}
                      onChange={(e) =>
                        setAddForm((f) => ({ ...f, yt_link: e.target.value }))
                      }
                      className="w-full px-3 py-2 border rounded"
                      placeholder="YouTube Link"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-4 mt-8">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-6 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/90"
                  >
                    Add
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={fetchProducts}
        seasonId={selectedSeasonId}
        seasonName={selectedSeason?.name}
      />
    </div>
  );
}
