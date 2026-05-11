"use client";

import { useState } from "react";
import { useProductSearch } from "@/hooks/useProducts";
import styles from "./ProductPickerModal.module.css";
import closeBtnStyles from "@/components/shared/CloseBtn.module.css";

interface Props {
  onSelect: (productId: string) => void;
  onClose: () => void;
}

export function ProductPickerModal({ onSelect, onClose }: Props) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading } = useProductSearch(q);
  const products = data?.items ?? [];

  return (
    <div className={styles.overlay}>
      <div className={styles.sheet}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>Attach Product</div>
          <button onClick={onClose} className={closeBtnStyles.closeBtn}>×</button>
        </div>

        <div className={styles.searchWrap}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className={styles.searchInput}
          />
        </div>

        <div className={styles.results}>
          {isLoading && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <div className="spinner" />
            </div>
          )}
          {!isLoading && products.length === 0 && (
            <div className={styles.empty}>
              {q ? "No products found" : "Start typing to search"}
            </div>
          )}
          <div className={styles.list}>
            {products.map((p) => {
              const isSelected = selected === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  className={`${styles.item} ${isSelected ? styles.selected : ""}`}
                >
                  <div className={styles.thumbWrap}>
                    {p.thumbnail_url
                      ? <img src={p.thumbnail_url} alt={p.name} />
                      : <span style={{ fontSize: 18 }}>{p.name[0]}</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.itemName}>{p.name}</div>
                    {p.brand && <div className={styles.itemBrand}>{p.brand}</div>}
                    {p.price != null && (
                      <div className={styles.itemPrice}>
                        ฿{p.price.toLocaleString("th-TH")}
                      </div>
                    )}
                  </div>
                  {isSelected && <span style={{ color: "#C49A3C", fontSize: 18 }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.footer}>
          <button
            onClick={() => { if (selected) onSelect(selected); }}
            disabled={!selected}
            className={`${styles.confirmBtn} ${selected ? styles.active : styles.inactive}`}
          >
            Attach to Project
          </button>
        </div>
      </div>
    </div>
  );
}