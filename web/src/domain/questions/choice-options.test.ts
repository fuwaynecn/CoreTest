import { phase2Catalog } from "@/content/phase2-catalog";
import { instantiateTemplate } from "./instantiate-template";
import { extractChoiceOptions } from "./choice-options";

test("extracts four labeled options from every reviewed choice variant", () => {
  for (const template of phase2Catalog.filter(({ answerMode }) => answerMode === "choice")) {
    const instance = instantiateTemplate(template, `choice-ui:${template.id}`);
    const options = extractChoiceOptions(instance.stem);
    expect(options, template.id).toHaveLength(4);
    expect(options.map(({ label }) => label)).toEqual(["A", "B", "C", "D"]);
    expect(options.every(({ text }) => text.length > 0), template.id).toBe(true);
  }
});
