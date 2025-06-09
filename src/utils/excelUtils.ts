import * as XLSX from "xlsx";
import fs from "fs";

export const jsontoSheet = (jsonData) => {
  // 将 JSON 转换为工作表
  const worksheet = XLSX.utils.json_to_sheet(jsonData);

  // 创建工作簿
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "员工数据");

  // 生成 Excel 文件
  const excelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  });

  // 保存到文件
  fs.writeFileSync("output.xlsx", excelBuffer);
};
