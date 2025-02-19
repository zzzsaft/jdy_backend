type Material =
  | "PC"
  | "PMMA"
  | "PET"
  | "GPPS"
  | "PP"
  | "PE"
  | "PVB"
  | "EVA"
  | "PS"
  | "ABS"
  | "PVC";
type ProductType =
  | "光学级"
  | "流延膜"
  | "片材"
  | "板材"
  | "发泡板"
  | "波浪板"
  | "中空格子板"
  | "定型模";

interface Requirements {
  name: string;
  polishing: {
    lipSurface: string;
    otherSurfaces: string;
    shape: string;
  };
  plating: {
    lipSurface: {
      treatment: string;
      thickness: string;
      hardness: string;
    };
    outerSurface: {
      thickness: string;
    };
  };
}

const requirementsMap: Record<ProductType, Requirements> = {
  光学级: {
    name: "光学级制品要求",
    polishing: {
      lipSurface: "0.015-0.025（um）",
      otherSurfaces: "0.02-0.03（um）",
      shape: "0.06—0.08（um）",
    },
    plating: {
      lipSurface: {
        treatment: "镀铬",
        thickness: "0.025-0.04mm",
        hardness: "60-65Rockwellc",
      },
      outerSurface: {
        thickness: "0.01-0.02mm",
      },
    },
  },
  流延膜: {
    name: "流延膜制品要求",
    polishing: {
      lipSurface: "0.02-0.03（um）",
      otherSurfaces: "0.03-0.04（um）",
      shape: "0.06—0.08（um）",
    },
    plating: {
      lipSurface: {
        treatment: "镀铬",
        thickness: "0.025-0.04mm",
        hardness: "60-65Rockwellc",
      },
      outerSurface: {
        thickness: "0.01-0.02mm",
      },
    },
  },
  片材: {
    name: "片材制品要求",
    polishing: {
      lipSurface: "0.02-0.04（um）",
      otherSurfaces: "0.03-0.05（um）",
      shape: "0.06—0.08（um）",
    },
    plating: {
      lipSurface: {
        treatment: "镀铬",
        thickness: "0.025-0.04mm",
        hardness: "60-65Rockwellc",
      },
      outerSurface: {
        thickness: "0.01-0.02mm",
      },
    },
  },
  板材: {
    name: "板材制品要求",
    polishing: {
      lipSurface: "0.03-0.05（um）",
      otherSurfaces: "0.035-0.05（um）",
      shape: "0.06—0.08（um）",
    },
    plating: {
      lipSurface: {
        treatment: "镀铬",
        thickness: "0.025-0.05mm",
        hardness: "60-65Rockwellc",
      },
      outerSurface: {
        thickness: "0.01-0.02mm",
      },
    },
  },
  发泡板: {
    name: "发泡板、波浪板制品要求",
    polishing: {
      lipSurface: "B级（0.04-0.05μm)",
      otherSurfaces: "0.04-0.06（um）",
      shape: "0.07—0.08（um）",
    },
    plating: {
      lipSurface: {
        treatment: "镀铬",
        thickness: "0.025-0.05mm",
        hardness: "60-65Rockwellc",
      },
      outerSurface: {
        thickness: "0.01-0.02mm",
      },
    },
  },
  波浪板: {
    name: "发泡板、波浪板制品要求",
    polishing: {
      lipSurface: "B级（0.04-0.05μm)",
      otherSurfaces: "0.04-0.06（um）",
      shape: "0.07—0.08（um）",
    },
    plating: {
      lipSurface: {
        treatment: "镀铬",
        thickness: "0.025-0.05mm",
        hardness: "60-65Rockwellc",
      },
      outerSurface: {
        thickness: "0.01-0.02mm",
      },
    },
  },
  中空格子板: {
    name: "中空格子板制品要求",
    polishing: {
      lipSurface: "A级（0.03-0.04μm)",
      otherSurfaces: "0.035-0.05（um）",
      shape: "0.06—0.08（um）",
    },
    plating: {
      lipSurface: {
        treatment: "镀铬",
        thickness: "0.025-0.05mm",
        hardness: "60-65Rockwellc",
      },
      outerSurface: {
        thickness: "0.01-0.02mm",
      },
    },
  },
  定型模: {
    name: "定型模制品要求",
    polishing: {
      lipSurface: "C级（0.05-0.06μm)",
      otherSurfaces: "0.06—0.08（um）",
      shape: "0.06—0.08（um）",
    },
    plating: {
      lipSurface: {
        treatment: "镀铬",
        thickness: "0.025-0.05mm",
        hardness: "60-65Rockwellc",
      },
      outerSurface: {
        thickness: "0.01-0.02mm",
      },
    },
  },
};

// 定义每种产品类型对应的有效材料
const validMaterials: Record<ProductType, Material[]> = {
  光学级: ["PC", "PMMA", "PET", "GPPS"],
  流延膜: ["PP", "PE", "PVB", "EVA"],
  片材: ["PP", "PE", "PS", "PET", "ABS"],
  板材: ["PP", "PE", "PVC", "ABS", "EVA"],
  发泡板: ["PVC"],
  波浪板: ["PVC"],
  中空格子板: ["PP", "PC"],
  定型模: ["PP", "PE", "PVC", "ABS", "EVA"], // 假设定型模支持这些材料
};

function getRequirements(type: ProductType, material: Material) {
  // 检查产品类型是否有效
  if (!requirementsMap[type]) {
    return "未找到对应的产品类型要求";
  }

  // 检查材料是否有效
  if (!validMaterials[type].includes(material)) {
    return `材料 ${material} 不适用于产品类型 ${type}。`;
  }
  return requirementsMap[type];
  const { polishing, plating } = requirementsMap[type];

  return `
        模唇流面抛光精度：${polishing.lipSurface}，
        其它流面抛光精度：${polishing.otherSurfaces}，
        外形抛光精度：${polishing.shape}。
        模头流面：${plating.lipSurface.treatment}，厚度：${plating.lipSurface.thickness}，硬度：${plating.lipSurface.hardness}，
        外表面镀铬层厚度：${plating.outerSurface.thickness}。
    `;
}
import { Request, Response } from "express";
export const 制品表面处理要求 = async (
  request: Request,
  response: Response
) => {
  const { type, material } = request.body;
  console.log(type, material);
  // 检查产品类型是否有效
  if (!requirementsMap[type]) {
    return response.send({});
  }
  const materials = material.split(",");
  const isValidMaterial = materials.some((material) =>
    validMaterials[type].includes(material)
  );
  // 检查材料是否有效
  if (!isValidMaterial) {
    return response.send({});
  }
  return response.send(requirementsMap[type]);
};
