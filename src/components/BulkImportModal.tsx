import { useState } from 'react';
import { X, Upload, Download, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        name: 'Example Product',
        category_id: 'category_uuid',
        description: 'Product description',
        actual_price: 100,
        offer_price: 80,
        stock: 50,
        content: '1 Box - 10 Pieces'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'product_import_template.xlsx');
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file to import');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const products = XLSX.utils.sheet_to_json(sheet);

        // Validate data
        for (const product of products as any[]) {
          if (!product.name || !product.category_id || !product.actual_price || !product.offer_price) {
            throw new Error('Missing required fields in some rows');
          }
        }

        // Insert products
        const { error } = await supabase
          .from('products')
          .insert(products);

        if (error) throw error;

        onSuccess();
        onClose();
      };

      reader.onerror = () => {
        throw new Error('Failed to read file');
      };

      reader.readAsBinaryString(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import products');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-background rounded-xl p-6 max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-2xl">Bulk Import Products</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-card/50 rounded-full transition-colors"
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
          <h3 className="font-montserrat font-bold text-lg mb-4">Instructions</h3>
          <ul className="space-y-2 text-text/80">
            <li>• Download and use the template file for correct format</li>
            <li>• All columns in the template are required</li>
            <li>• category_id must be a valid UUID from your categories</li>
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
              <span>{file ? file.name : 'Choose File'}</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg hover:bg-card/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!file || loading}
            className="btn-primary"
          >
            {loading ? 'Importing...' : 'Import Products'}
          </button>
        </div>
      </div>
    </div>
  );
}