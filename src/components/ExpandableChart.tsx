import { useState, ReactElement, cloneElement } from "react";
import { Maximize2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ExpandableChartProps {
  title: string;
  children: ReactElement;
  containerHeight?: string;
}

export function ExpandableChart({
  title,
  children,
  containerHeight = "h-[300px]",
}: ExpandableChartProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <div className="bg-card rounded-xl p-6 overflow-hidden flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-montserrat font-bold text-xl">{title}</h3>
          <button
            onClick={() => setIsExpanded(true)}
            className="p-2 hover:bg-black/5 rounded-full transition-colors text-text/60 hover:text-primary-orange"
            title="Expand Chart"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
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
