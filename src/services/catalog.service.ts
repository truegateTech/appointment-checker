import fs from "node:fs";
import path from "node:path";
import type {
  CountryOption,
  PortalCatalog,
  ProcedureOption,
  ProvinceOption,
} from "@/types/catalog.types";

const CATALOG_PATH = path.resolve("data/catalog.json");

const FALLBACK_CATALOG: PortalCatalog = {
  updatedAt: new Date(0).toISOString(),
  provinces: [
    {
      code: "8",
      name: "Barcelona",
      url: "https://icp.administracionelectronica.gob.es/icpplustieb/citar?p=8&locale=es",
      procedures: [
        {
          code: "4010",
          name: "POLICIA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA)",
          selectName: "tramiteGrupo[1]",
        },
      ],
    },
  ],
  countries: [{ code: "316", name: "" }],
};

class CatalogService {
  private catalog: PortalCatalog;

  constructor() {
    this.catalog = this.load();
  }

  load(): PortalCatalog {
    if (fs.existsSync(CATALOG_PATH)) {
      try {
        return JSON.parse(
          fs.readFileSync(CATALOG_PATH, "utf8"),
        ) as PortalCatalog;
      } catch {
        console.warn("Failed to parse data/catalog.json; using fallback.");
      }
    }
    return FALLBACK_CATALOG;
  }

  reload(): void {
    this.catalog = this.load();
  }

  getProvinces(): ProvinceOption[] {
    return this.catalog.provinces;
  }

  getProvince(code: string): ProvinceOption | undefined {
    return this.catalog.provinces.find((p) => p.code === code);
  }

  getProcedure(
    provinceCode: string,
    procedureCode: string,
  ): ProcedureOption | undefined {
    return this.getProvince(provinceCode)?.procedures.find(
      (pr) => pr.code === procedureCode,
    );
  }

  searchCountries(query: string): CountryOption[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.catalog.countries.slice(0, 8);
    return this.catalog.countries
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }

  getCountry(code: string): CountryOption | undefined {
    return this.catalog.countries.find((c) => c.code === code);
  }
}

export const catalogService = new CatalogService();
