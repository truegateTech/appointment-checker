export interface ProcedureOption {
  code: string;
  name: string;
  selectName: string; // e.g. "tramiteGrupo[0]" or "tramiteGrupo[1]"
}

export interface ProvinceOption {
  code: string; // e.g. "8" for Barcelona
  name: string; // e.g. "Barcelona"
  url: string; // Full direct URL e.g. https://icp.../icpplustieb/citar?p=8&locale=es
  procedures: ProcedureOption[];
}

export interface CountryOption {
  code: string; // e.g. "317"
  name: string; // e.g. "INDIA"
}

export interface PortalCatalog {
  updatedAt: string;
  provinces: ProvinceOption[];
  countries: CountryOption[];
}
