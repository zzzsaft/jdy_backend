import { Brackets } from "typeorm";
import { UPLOADED_STATUSES } from "../archive/types.js";

export type ContractListFilterParams = {
  status?: "uploaded" | "normalized" | "archived";
  q?: string;
  productNumber?: string;
  customerId?: string;
};

export function applyContractDocumentListFilters(
  builder: any,
  params?: ContractListFilterParams,
) {
  if (params?.status === "uploaded") {
    builder.andWhere("document.status IN (:...statuses)", {
      statuses: UPLOADED_STATUSES,
    });
  } else if (params?.status === "normalized") {
    builder.andWhere("document.status = :status", { status: "normalized" });
  }

  if (params?.q) {
    builder.andWhere(
      new Brackets((qb) => {
        qb.where("document.file_name ILIKE :q", { q: `%${params.q}%` })
          .orWhere(
            "extraction.normalized_extraction_json #>> '{document_info,product_number,value}' ILIKE :q",
            { q: `%${params.q}%` },
          )
          .orWhere(
            "extraction.normalized_extraction_json #>> '{document_info,die_number,value}' ILIKE :q",
            { q: `%${params.q}%` },
          )
          .orWhere(
            "extraction.normalized_extraction_json #>> '{document_info,contract_number,value}' ILIKE :q",
            { q: `%${params.q}%` },
          )
          .orWhere(
            "extraction.normalized_extraction_json #>> '{document_info,order_number,value}' ILIKE :q",
            { q: `%${params.q}%` },
          );
      }),
    );
  }
  if (params?.customerId) {
    builder.andWhere(
      new Brackets((qb) => {
        qb.where("archive.customer_id = :customerId", {
          customerId: params.customerId,
        }).orWhere(
          "extraction.normalized_extraction_json #>> '{document_info,customer_id,value}' = :customerId",
          { customerId: params.customerId },
        );
      }),
    );
  }
  if (params?.productNumber) {
    builder.andWhere(
      new Brackets((qb) => {
        qb.where("archive.product_number ILIKE :productNumber", {
          productNumber: `%${params.productNumber}%`,
        })
          .orWhere(
            "extraction.normalized_extraction_json #>> '{document_info,product_number,value}' ILIKE :productNumber",
            { productNumber: `%${params.productNumber}%` },
          )
          .orWhere(
            "extraction.normalized_extraction_json #>> '{document_info,die_number,value}' ILIKE :productNumber",
            { productNumber: `%${params.productNumber}%` },
          );
      }),
    );
  }
}

export function applyContractArchiveListFilters(
  builder: any,
  params?: Pick<ContractListFilterParams, "q" | "productNumber" | "customerId">,
) {
  if (params?.customerId) {
    builder.andWhere("archive.customer_id = :customerId", {
      customerId: params.customerId,
    });
  }
  if (params?.productNumber) {
    builder.andWhere(
      new Brackets((qb) => {
        qb.where("archive.product_number ILIKE :productNumber", {
          productNumber: `%${params.productNumber}%`,
        }).orWhere("binding.product_number ILIKE :productNumber", {
          productNumber: `%${params.productNumber}%`,
        });
      }),
    );
  }
  if (params?.q) {
    builder.andWhere(
      new Brackets((qb) => {
        qb.where("archive.product_number ILIKE :q", { q: `%${params.q}%` })
          .orWhere("archive.contract_number ILIKE :q", { q: `%${params.q}%` })
          .orWhere("archive.order_number ILIKE :q", { q: `%${params.q}%` })
          .orWhere("archive.customer_id ILIKE :q", { q: `%${params.q}%` })
          .orWhere("binding.product_number ILIKE :q", { q: `%${params.q}%` });
      }),
    );
  }
}
