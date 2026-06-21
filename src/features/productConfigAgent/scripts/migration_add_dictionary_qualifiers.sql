CREATE TABLE IF NOT EXISTS quote_agent.dictionary_qualifiers (
  id BIGSERIAL PRIMARY KEY,
  qualifier_key VARCHAR(100) NOT NULL,
  kind VARCHAR(30) NOT NULL,
  display_name TEXT NOT NULL,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT uq_dictionary_qualifiers_key UNIQUE(qualifier_key),
  CONSTRAINT chk_dictionary_qualifiers_kind CHECK (kind IN ('position', 'area', 'layer'))
);

CREATE INDEX IF NOT EXISTS idx_dictionary_qualifiers_kind
  ON quote_agent.dictionary_qualifiers(kind);

CREATE INDEX IF NOT EXISTS idx_dictionary_qualifiers_is_active
  ON quote_agent.dictionary_qualifiers(is_active);

ALTER TABLE quote_agent.dictionary_qualifiers
  DROP CONSTRAINT IF EXISTS chk_dictionary_qualifiers_kind;

ALTER TABLE quote_agent.dictionary_qualifiers
  ADD CONSTRAINT chk_dictionary_qualifiers_kind
  CHECK (kind IN ('position', 'area', 'layer'));

INSERT INTO quote_agent.dictionary_qualifiers(
  qualifier_key,
  kind,
  display_name,
  aliases,
  description,
  sort_order
)
VALUES
  ('upper_die', 'position', '上模', '["上模", "上 模", "upper die"]'::jsonb, '模具上模位置限定', 10),
  ('lower_die', 'position', '下模', '["下模", "下 模", "lower die"]'::jsonb, '模具下模位置限定', 20),
  ('pre_pump', 'position', '泵前', '["泵前", "泵 前", "before pump"]'::jsonb, '泵前位置限定', 30),
  ('post_pump', 'position', '泵后', '["泵后", "泵 后", "after pump"]'::jsonb, '泵后位置限定', 40),
  ('pre_mesh', 'position', '网前', '["网前", "网 前", "before mesh"]'::jsonb, '过滤网前位置限定', 50),
  ('post_mesh', 'position', '网后', '["网后", "网 后", "after mesh"]'::jsonb, '过滤网后位置限定', 60),
  ('inlet', 'position', '入口', '["入口", "进料口", "inlet"]'::jsonb, '入口或进料口位置限定', 70),
  ('c_inlet', 'position', 'C入口', '["C入口", "C口", "C 入口", "C inlet"]'::jsonb, 'C入口位置限定', 80),
  ('layer', 'layer', '层位', '["A层", "B层", "C层", "D层", "第一层", "第1层", "layer"]'::jsonb, '多层结构中的层位限定，具体层号写入 qualifier.layer/layerIndex', 90),
  ('body', 'area', '本体', '["本体", "主体", "body"]'::jsonb, '本体或主体区域限定', 110),
  ('die_body', 'area', '模体', '["模体", "模头", "上模体", "下模体", "die body"]'::jsonb, '模体区域限定', 120),
  ('lip', 'area', '模唇', '["模唇", "唇口", "lip"]'::jsonb, '模唇区域限定', 130),
  ('connector', 'area', '连接器', '["连接器", "接头", "接线盒", "接插件", "connector"]'::jsonb, '连接器或接头区域限定', 140),
  ('insert_block', 'area', '镶块', '["镶块", "insert block", "insert_block"]'::jsonb, '镶块区域限定', 150),
  ('channel', 'area', '流道', '["流道", "流面", "腔体", "channel"]'::jsonb, '流道或腔体区域限定', 160),
  ('external_surface', 'area', '外表面', '["外形", "外表面", "精磨", "external surface"]'::jsonb, '外形或外表面区域限定', 170),
  ('side_plate', 'area', '侧板', '["侧板", "两侧板", "side plate", "side_plate"]'::jsonb, '侧板区域限定', 180),
  ('feedblock', 'area', '分配器', '["分配器", "合流器", "feedblock", "manifold"]'::jsonb, '分配器区域限定', 190),
  ('pump', 'area', '泵体', '["泵体", "pump"]'::jsonb, '泵体区域限定', 200),
  ('overall', 'area', '总体', '["总体", "总加热", "总分区", "总计", "合计", "overall", "total"]'::jsonb, '总体或汇总限定', 210),
  ('other', 'area', '其他', '["其他", "其它", "other"]'::jsonb, '其他区域限定', 220)
ON CONFLICT (qualifier_key) DO UPDATE SET
  kind = EXCLUDED.kind,
  display_name = EXCLUDED.display_name,
  aliases = EXCLUDED.aliases,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();
