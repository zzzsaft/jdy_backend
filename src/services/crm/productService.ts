// src/services/ProductService.ts
import { jdyFormDataApiClient } from "../../api/jdy/form_data";
import { Product } from "../../entity/crm/product";
import { Pump } from "../../entity/crm/productPump";
import { Filter } from "../../entity/crm/productFilter";
import { QuoteItem } from "../../entity/crm/quote";

export class ProductService {
  appid = "6191e49fc6c18500070f60ca";
  entryid = "60458a6440c90e0008c75561";
  fromApiToEntity(apiData: any): Product {
    return Product.create({
      id: apiData._id,
      level1Category: apiData._widget_1742960278476,
      level2Category: apiData._widget_1742960278477,
      level3Category: apiData._widget_1742968828125,
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
    formType: string
  ): Promise<{
    item: QuoteItem;
    material: string[];
    industry: string;
    customer: string;
    finalProduct: string;
    orderDate: string;
  }[]> {
    if (!keyword || !field || !formType) {
      return [];
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

      const items = await query
        .orderBy("quote.quoteTime", "DESC")
        .getMany();

      return items.map((i) => ({
        item: i,
        material: i.quote?.material ?? [],
        industry: "",
        customer: i.quote?.customerName ?? "",
        finalProduct: i.quote?.finalProduct ?? "",
        orderDate: i.quote?.quoteTime?.toISOString() ?? "",
      }));
    } catch (error) {
      console.error("searchProducts error", error);
      return [];
    }
  }
}

export const productService = new ProductService();
