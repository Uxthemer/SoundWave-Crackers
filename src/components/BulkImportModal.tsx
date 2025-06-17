import { useState, useEffect } from "react";
import { X, Upload, Download, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkImportModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    []
  );

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name");
      if (error) {
        console.error("Error fetching categories:", error);
      } else {
        setCategories(data);
      }
    };

    fetchCategories();
  }, []);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const downloadTemplate = async () => {
    if (categories.length === 0) {
      alert(
        "No categories available. Please add categories before downloading the template."
      );
      return;
    }

    // Define Template Data
    const template = [
      {
        product_code: "Enter Product Code",
        category_id: "Select from dropdown",
        name: "Example Product",
        apr: "Actual Purchase Rate",
        actual_price: 100,
        offer_price: 80,
        stock: 50,
        image_url: "productname.jpg",
        discount_percentage: "10",
        content: "1 Box - 10 Pieces",
        description: "Product description",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);

    // Create Categories Sheet
    const categorySheetData = [
      ["ID", "Category Name"],
      ...categories.map((c) => [c.id, c.name]),
    ];
    const wsCategories = XLSX.utils.aoa_to_sheet(categorySheetData);

    // Define Named Range (Google Sheets and Excel Friendly)
    const categoryRange = `Categories!$B$2:$B$${categories.length + 1}`;

    // Apply Data Validation for Dropdown in Category Column (Excel Compatible)
    ws["!dataValidation"] = [
      {
        type: "list",
        allowBlank: false,
        sqref: "B2:B100", // Category Column (Adjust Range as Needed)
        formula1: categoryRange, // Reference Category Names
      },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.utils.book_append_sheet(wb, wsCategories, "Categories");

    XLSX.writeFile(wb, "product_import_template.xlsx");
  };

  const handleImport = async () => {
    if (!file) {
      setError("Please select a file to import");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const products = XLSX.utils.sheet_to_json(sheet);

          // Convert category name to category_id
          const formattedProducts = (products as any[]).map((product) => ({
            ...product,
            category_id:
              categories.find((category) => category.name === product.category_id)
                ?.id || null,
          }));

          // Validate data
          for (const product of formattedProducts as any[]) {
            if (
              !product.name ||
              !product.category_id ||
              !product.actual_price ||
              !product.offer_price ||
              !product.stock ||
              !product.content ||
              !product.apr ||
              !product.product_code
            ) {
              throw new Error("Missing required fields in some rows");
            }
          }

          // Separate products into updates and inserts based on product_code
          const productCodes = formattedProducts.map((p) => p.product_code);
          // Fetch existing products with these product_codes
          const { data: existingProducts, error: fetchError } = await supabase
            .from("products")
            .select("id, product_code")
            .in("product_code", productCodes);

          if (fetchError) throw fetchError;

          const existingCodes = (existingProducts || []).map((p) => p.product_code);

          const toUpdate = formattedProducts.filter((p) =>
            existingCodes.includes(p.product_code)
          );
          const toInsert = formattedProducts.filter(
            (p) => !existingCodes.includes(p.product_code)
          );

          // Update existing products
          for (const product of toUpdate) {
            const existing = (existingProducts || []).find(
              (ep) => ep.product_code === product.product_code
            );
            if (existing) {
              const { error: updateError } = await supabase
                .from("products")
                .update(product)
                .eq("id", existing.id);
              if (updateError) throw updateError;
            }
          }

          // Insert new products
          if (toInsert.length > 0) {
            const { error: insertError } = await supabase
              .from("products")
              .insert(toInsert);
            if (insertError) throw insertError;
          }

          onSuccess();
          onClose();
        } catch (err) {
          toast.error("Failed to import products" + err);
          setError(
            err instanceof Error ? err.message : "Failed to import products"
          );
        } finally {
          setLoading(false);
        }
      };

      reader.onerror = () => {
        setError("Failed to read file");
        setLoading(false);
      };

      reader.readAsBinaryString(file);
    } catch (err) {
      toast.error("Failed to import products" + err);
      setError(
        err instanceof Error ? err.message : "Failed to import products"
      );
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      {/* Loading Backdrop */}
      {loading && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40">
          <div className="flex flex-col items-center">
            <span className="loader mb-4" />
            <span className="text-white text-lg">Importing products...</span>
          </div>
        </div>
      )}
      <div
        className={`bg-background rounded-xl p-6 max-w-2xl w-full mx-4 ${
          loading ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-2xl">Bulk Import Products</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-card/50 rounded-full transition-colors"
            disabled={loading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="bg-primary-red/10 text-primary-red p-4 rounded-lg mb-6 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="bg-card/30 rounded-lg p-6 mb-6">
          <h3 className="font-montserrat font-bold text-lg mb-4">
            Instructions
          </h3>
          <ul className="space-y-2 text-text/80">
            <li>• Download and use the template file for correct format</li>
            <li>• All columns in the template are required</li>
            <li>• Select a category from the dropdown list in the template</li>
            <li>• Prices should be numbers without currency symbols</li>
            <li>• Stock quantity must be a positive number</li>
          </ul>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card hover:bg-card/70 transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>Download Template</span>
          </button>

          <div className="flex-1">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-orange text-white hover:bg-primary-orange/80 transition-colors cursor-pointer w-full justify-center"
            >
              <Upload className="w-5 h-5" />
              <span>{file ? file.name : "Choose File"}</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg hover:bg-card/50 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!file || loading}
            className="btn-primary"
          >
            {loading ? "Importing..." : "Import Products"}
          </button>
        </div>
      </div>
      {/* Simple loader style, or use your own spinner */}
      <style>{`
      .loader {
        border: 4px solid #fff;
        border-top: 4px solid #ff9800;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        0% { transform: rotate(0deg);}
        100% { transform: rotate(360deg);}
      }
    `}</style>
    </div>
  );
}
