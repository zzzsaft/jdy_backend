// src/services/ProductService.ts
import { Product } from "../../entity/crm/product";
import { Pump } from "../../entity/crm/productPump";
import { Filter } from "../../entity/crm/productFilter";
import { QuoteItem } from "../../entity/crm/quote";
import { jdyFormDataApiClient } from "../../features/jdy/api/form_data";

export class ProductService {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "60458a6440c90e0008c75561";
  fromApiToEntity(apiData: any): Product {
    return Product.create({
      id: apiData._id,
      level1Category: apiData._widget_1742960278476,
      level2Category: apiData._widget_1742960278477,
      level3Category: apiData._widget_1742968828125,
      name: apiData._widget_1756829133536,
      aliasName: apiData._widget_1742968828113,
      configuration: apiData._widget_1742960278481,
      unit: apiData._widget_1742968828129,
      features: apiData._widget_1615863662983,
      applicationScenarios: apiData._widget_1742960278480,
    });
  }
  findJdy = async () => {
    const result = await jdyFormDataApiClient.batchDataQuery(
      this.appid,
      this.entryid,
      { limit: 100 }
    );
    return result;
  };
  addAlltoDb = async () => {
    const data = await this.findJdy();
    const c: Product[] = [];
    for (const item of data) {
      const cus = this.fromApiToEntity(item);
      c.push(cus);
    }
    await Product.save(c);
  };
  saveToDb = async (data: any) => {
    const cus = this.fromApiToEntity(data);
    await Product.save(cus);
  };
  getCategory = async () => {
    return await Product.find({
      select: ["level1Category", "level2Category", "level3Category"],
    });
  };
  getPump = async () => {
    return await Pump.find();
  };

  getFilter = async () => {
    return await Filter.find();
  };

  async searchProducts(
    keyword: string,
    field: "code" | "name",
    formType: string,
    page = 1,
    pageSize = 10
  ): Promise<{
    list: {
      item: QuoteItem;
      material: string[];
      industry: string;
      customer: string;
      finalProduct: string;
      orderDate: string;
    }[];
    total: number;
  }> {
    if (!keyword || !field || !formType) {
      return { list: [], total: 0 };
    }

    try {
      const query = QuoteItem.createQueryBuilder("item")
        .leftJoinAndSelect("item.quote", "quote")
        .where("item.formType = :formType", { formType });

      if (field === "code") {
        query.andWhere("item.productCode = :keyword", { keyword });
      } else {
        query.andWhere("item.productName LIKE :keyword", {
          keyword: `%${keyword}%`,
        });
      }

      const [items, total] = await query
        .orderBy("quote.quoteTime", "DESC")
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();

      return {
        list: items.map((i) => ({
          item: i,
          material: i.quote?.material ?? [],
          industry: "",
          customer: i.quote?.customerName ?? "",
          finalProduct: i.quote?.finalProduct ?? "",
          orderDate: i.quote?.quoteTime?.toISOString() ?? "",
        })),
        total,
      };
    } catch (error) {
      console.error("searchProducts error", error);
      return { list: [], total: 0 };
    }
  }
}

export const productService = new ProductService();
