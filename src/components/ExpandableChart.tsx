import { useState, ReactElement, cloneElement, useMemo } from "react";
import { Eye, Download, Maximize2, X, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";

type TableRecord = Record<string, string | number | null | undefined | boolean>;

interface ExpandableChartProps {
  title: string;
  children: ReactElement;
  containerHeight?: string;
  viewData?: TableRecord[];
  exportFileName?: string;
}

interface SortState {
  key: string;
  direction: "asc" | "desc";
}

export function ExpandableChart({
  title,
  children,
  containerHeight = "h-[300px]",
  viewData = [],
  exportFileName,
}: ExpandableChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortState, setSortState] = useState<SortState | null>(null);

  const filteredViewData = useMemo(() => {
    let data = viewData;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      data = data.filter((row) =>
        Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(term))
      );
    }

    if (!sortState) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortState.key];
      const bValue = b[sortState.key];

      const aNum = typeof aValue === "number" ? aValue : Number(aValue ?? 0);
      const bNum = typeof bValue === "number" ? bValue : Number(bValue ?? 0);

      const isNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);

      if (isNumeric) {
        return sortState.direction === "asc" ? aNum - bNum : bNum - aNum;
      }

      const aText = String(aValue ?? "").toLowerCase();
      const bText = String(bValue ?? "").toLowerCase();

      return sortState.direction === "asc"
        ? aText.localeCompare(bText)
        : bText.localeCompare(aText);
    });
  }, [viewData, searchTerm, sortState]);

  const toggleSort = (key: string) => {
    setSortState((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: "asc" };
      }

      return {
        key,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  const exportToExcel = () => {
    if (!viewData.length) return;

    const normalizedRows = viewData.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, value ?? ""])
      )
    );

    const worksheet = XLSX.utils.json_to_sheet(normalizedRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title.replace(/\s+/g, "_") || "Data");
    XLSX.writeFile(workbook, exportFileName || `${title}.xlsx`);
  };

  const tableColumns = viewData.length > 0 ? Object.keys(viewData[0]) : [];

  return (
    <>
      <div className="bg-card rounded-xl p-6 overflow-hidden flex flex-col h-full">
        <div className="flex items-center justify-between mb-6 gap-3">
          <h3 className="font-montserrat font-bold text-xl">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsViewing(true)}
              disabled={!viewData.length}
              className="p-2 hover:bg-black/5 rounded-full transition-colors text-text/60 hover:text-primary-orange disabled:opacity-40 disabled:cursor-not-allowed"
              title="View Records"
            >
              <Eye className="w-5 h-5" />
            </button>
            <button
              onClick={exportToExcel}
              disabled={!viewData.length}
              className="p-2 hover:bg-black/5 rounded-full transition-colors text-text/60 hover:text-primary-orange disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export Excel"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsExpanded(true)}
              className="p-2 hover:bg-black/5 rounded-full transition-colors text-text/60 hover:text-primary-orange"
              title="Expand Chart"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className={`relative w-full ${containerHeight}`}>
          {cloneElement(children, {
            options: {
              ...children.props.options,
              maintainAspectRatio: false,
              responsive: true,
            },
          })}
        </div>
      </div>

      <AnimatePresence>
        {isViewing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
            onClick={() => setIsViewing(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl p-6 flex flex-col border border-card-border/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 gap-4">
                <h3 className="font-heading text-2xl">{title} — Records</h3>
                <button
                  onClick={() => setIsViewing(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-text hover:text-primary-red"
                >
                  <X className="w-7 h-7" />
                </button>
              </div>

              <div className="mb-4 flex items-center gap-2 rounded-lg border border-card-border/20 bg-background/40 px-3 py-2">
                <Search className="w-4 h-4 text-text/50" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search records..."
                  className="w-full bg-transparent outline-none text-sm"
                />
              </div>

              <div className="overflow-auto border border-card-border/20 rounded-lg">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-card/60 sticky top-0">
                    <tr>
                      {tableColumns.map((column) => (
                        <th
                          key={column}
                          className="p-3 text-left font-semibold whitespace-nowrap cursor-pointer select-none"
                          onClick={() => toggleSort(column)}
                        >
                          <div className="flex items-center gap-1">
                            <span>{column}</span>
                            {sortState?.key === column && (
                              <span className="text-xs">
                                {sortState.direction === "asc" ? "↑" : "↓"}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredViewData.map((row, index) => (
                      <tr key={`${title}-${index}`} className="border-t border-card-border/10">
                        {tableColumns.map((column) => (
                          <td key={`${column}-${index}`} className="p-3 align-top whitespace-nowrap">
                            {String(row[column] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
            onClick={() => setIsExpanded(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card w-full h-full max-w-7xl max-h-[90vh] rounded-2xl shadow-2xl p-6 flex flex-col relative border border-card-border/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-heading text-2xl sm:text-3xl">{title}</h3>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-text hover:text-primary-red"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>
              <div className="flex-1 w-full min-h-0 relative">
                {cloneElement(children, {
                  options: {
                    ...children.props.options,
                    maintainAspectRatio: false,
                    responsive: true,
                  },
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
