import { Like } from "typeorm";
import { ProductPart } from "../../entity/crm/productPart";

class PartService {
  async searchParts(keyword: string): Promise<ProductPart[]> {
    if (!keyword) {
      return [];
    }
    return ProductPart.find({
      where: [
        { name: Like(`%${keyword}%`) },
        { category: Like(`%${keyword}%`) },
      ],
    });
  }
}

export const partService = new PartService();

