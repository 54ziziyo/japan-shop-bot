// ============================================================
// WooCommerce REST API 客戶端
// auto-listing/src/woocommerce.ts
// ============================================================
// 用 axios + Basic Auth（ck/cs）：查分類、查重(SKU)、建送審商品與變體。
// API 文件：https://woocommerce.github.io/woocommerce-rest-api-docs/

import axios, { type AxiosInstance } from 'axios';
import type { WooConfig } from './config';
import type { BuiltProduct, WooVariationPayload } from './buildProduct';

export interface CreatedProduct {
  id: number;
  permalink: string;
  editLink: string;
}

export interface WooCategory {
  id: number;
  name: string;
  parent: number;
  slug: string;
}

export interface ExistingProduct {
  id: number;
  name: string;
  editLink: string;
}

export interface ProductData {
  id: number;
  images: { id: number; src: string; alt: string }[];
}

export class WooClient {
  private http: AxiosInstance;
  private storeUrl: string;

  constructor(cfg: WooConfig) {
    this.storeUrl = cfg.storeUrl;
    this.http = axios.create({
      baseURL: `${cfg.storeUrl}/wp-json/wc/v3`,
      auth: { username: cfg.consumerKey, password: cfg.consumerSecret },
      timeout: 60000, // 建商品要從來源網址抓圖，給長一點
      headers: { 'content-type': 'application/json' },
    });
  }

  /** 連線測試 */
  async ping(): Promise<void> {
    await this.http.get('/products', { params: { per_page: 1 } });
  }

  /** 抓全部商品分類（分頁抓完） */
  async getCategories(): Promise<WooCategory[]> {
    const all: WooCategory[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data } = await this.http.get('/products/categories', {
        params: { per_page: 100, page },
      });
      if (!Array.isArray(data) || data.length === 0) break;
      for (const c of data) {
        all.push({ id: c.id, name: c.name, parent: c.parent, slug: c.slug });
      }
      if (data.length < 100) break;
    }
    return all;
  }

  /** 用 SKU 查是否已上架（去重）；找到回傳該商品，否則 null */
  async findProductBySku(sku: string): Promise<ExistingProduct | null> {
    const { data } = await this.http.get('/products', { params: { sku } });
    if (Array.isArray(data) && data.length > 0) {
      const p = data[0];
      return {
        id: p.id,
        name: p.name,
        editLink: `${this.storeUrl}/wp-admin/post.php?post=${p.id}&action=edit`,
      };
    }
    return null;
  }

  /** 建變體商品（publish）+ 所有變體（batch）；回傳商品 id 與後台編輯連結 */
  async createProduct(built: BuiltProduct): Promise<CreatedProduct> {
    const { data: product } = await this.http.post('/products', built.product);
    const id: number = product.id;
    console.log(`🆕 已建商品 #${id}：${product.name}`);

    await this.createVariationsBatch(id, built.variations);

    return {
      id,
      permalink: product.permalink,
      editLink: `${this.storeUrl}/wp-admin/post.php?post=${id}&action=edit`,
    };
  }

  /** 用 batch API 批量建立變體（每次最多 100 個） */
  async createVariationsBatch(
    productId: number,
    variations: WooVariationPayload[],
  ): Promise<void> {
    const BATCH = 100;
    let total = 0;
    for (let i = 0; i < variations.length; i += BATCH) {
      const chunk = variations.slice(i, i + BATCH);
      const { data } = await this.http.post(
        `/products/${productId}/variations/batch`,
        { create: chunk },
      );
      const done = (data.create as unknown[])?.length ?? chunk.length;
      total += done;
      console.log(
        `   ✅ 批次 ${Math.ceil((i + 1) / BATCH)}：${done} 個變體建立完成（共 ${total}/${variations.length}）`,
      );
    }
  }

  /** 建立商品分類；parent=0 表示最上層 */
  async createCategory(name: string, parentId: number): Promise<WooCategory> {
    const { data } = await this.http.post('/products/categories', {
      name,
      parent: parentId,
    });
    return { id: data.id, name: data.name, parent: data.parent, slug: data.slug };
  }

  /** 取商品所有變體（分頁抓完），含 stock_status / manage_stock */
  async getVariations(productId: number): Promise<{ id: number; stock_status: string; manage_stock: string | boolean; attributes: { name: string; option: string }[] }[]> {
    const all: { id: number; stock_status: string; manage_stock: string | boolean; attributes: { name: string; option: string }[] }[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data } = await this.http.get(`/products/${productId}/variations`, {
        params: { per_page: 100, page },
      });
      if (!Array.isArray(data) || data.length === 0) break;
      for (const v of data) all.push({ id: v.id, stock_status: v.stock_status, manage_stock: v.manage_stock, attributes: v.attributes });
      if (data.length < 100) break;
    }
    return all;
  }

  /** 更新單一變體 */
  async updateVariation(productId: number, variationId: number, data: Record<string, unknown>): Promise<void> {
    await this.http.put(`/products/${productId}/variations/${variationId}`, data);
  }

  /** 更新商品（任意欄位） */
  async updateProduct(productId: number, data: Record<string, unknown>): Promise<void> {
    await this.http.put(`/products/${productId}`, data);
  }

  /** 取單一商品（含 images 陣列）；用於社交圖片與 alt 修正 */
  async getProduct(productId: number): Promise<ProductData> {
    const { data } = await this.http.get(`/products/${productId}`);
    return {
      id: data.id,
      images: (data.images ?? []).map((img: { id: number; src: string; alt: string }) => ({
        id: img.id,
        src: img.src,
        alt: img.alt ?? '',
      })),
    };
  }
}
