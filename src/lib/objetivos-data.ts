export type ObjetivoKind = 'compania' | 'departamento' | 'clave' | 'estrategico' | 'individual';

export interface ObjetivoItem {
  id: string;
  kind: ObjetivoKind;
  corto: string;
  peso: number;
  titulo: string;
  cifra: string | null;
  medida: string;
  partes?: { peso: number; titulo: string; medida: string }[];
}

export interface ObjetivoPack {
  id: 'cristobal-actual' | 'cristobal-anterior' | 'blanca-actual';
  persona: 'Cristóbal Alonso' | 'Blanca Sancho';
  rol: string;
  vigente: boolean;
  etiqueta: string;
  fuente: string;
  reunion: string | null;
  liderArchivo: string;
  responsableActual: string;
  nota: string | null;
  escala?: { rango: string; pago: string }[];
  items: ObjetivoItem[];
}

export const OBJETIVO_KIND_LABEL: Record<ObjetivoKind, string> = {
  compania: 'Compañía',
  departamento: 'Departamento',
  clave: 'Clave',
  estrategico: 'Estratégico',
  individual: 'Individual',
};

export const CRISTOBAL_ACTUAL: ObjetivoPack = {
  id: 'cristobal-actual',
  persona: 'Cristóbal Alonso',
  rol: 'Teamsales Operations Manager',
  vigente: true,
  etiqueta: 'Actuales · FY 26/27',
  fuente: 'Objetivos FY 2627_Cristobal Alonso.xlsx',
  reunion: null,
  liderArchivo: 'Alberto Antequera',
  responsableActual: 'Alberto Antequera',
  nota: null,
  escala: [
    { rango: '< 80%', pago: '0%' },
    { rango: '80 – 90%', pago: '50%' },
    { rango: '90 – 95%', pago: '75%' },
    { rango: '95 – 100%', pago: '90%' },
    { rango: '100 – 105%', pago: '100%' },
    { rango: '105 – 110%', pago: '120%' },
    { rango: '> 110%', pago: '140%' },
  ],
  items: [
    {
      id: 'ca-ebitda',
      kind: 'compania',
      corto: 'EBITDA',
      peso: 25,
      titulo: 'EBITDA FY 26/27',
      cifra: '13,1 M€',
      medida: 'Post bonus: se calcula una vez pagados los bonus. Lleva escala de consecución sobre este 25%.',
    },
    {
      id: 'ca-margin',
      kind: 'departamento',
      corto: 'C Margin',
      peso: 25,
      titulo: 'C Margin Teamsport',
      cifra: '8,8 M€',
      medida: 'Según el split del pantallazo de referencia del objetivo.',
    },
    {
      id: 'ca-stock',
      kind: 'departamento',
      corto: 'Stock',
      peso: 25,
      titulo: 'Stock por debajo de 11 M€',
      cifra: '< 11 M€',
      medida: 'Stock final en Equipaciones y B2B.',
    },
    {
      id: 'ca-ind',
      kind: 'individual',
      corto: 'Individual',
      peso: 25,
      titulo: 'Objetivos individuales',
      cifra: null,
      medida: 'El 25% se parte en cuatro palancas.',
      partes: [
        {
          peso: 5,
          titulo: 'Procesos de optimización en Teamsport',
          medida: 'Webs a través de IA. Reducir el tiempo de creación.',
        },
        {
          peso: 10,
          titulo: 'Francia',
          medida: 'Facturación margen Francia Teamsport (sin clearance, sin web Ekin): 15,6 M€ y 39,17% de margen neto, con los off invoices solo de teamwear.',
        },
        {
          peso: 5,
          titulo: 'Seguimiento descuentos off marcas',
          medida: 'Monitorizar que todos los off y credit notes se cumplen.',
        },
        {
          peso: 5,
          titulo: 'Seguimiento excesos estampaciones',
          medida: 'Seguimiento con Finanzas de que está correctamente imputado.',
        },
      ],
    },
  ],
};

export const CRISTOBAL_ANTERIOR: ObjetivoPack = {
  id: 'cristobal-anterior',
  persona: 'Cristóbal Alonso',
  rol: 'Teamsales Operations Manager',
  vigente: false,
  etiqueta: 'Anteriores · Target Setting',
  fuente: 'TARGET SETTING_26-27_Cristobal Alonso.xlsx',
  reunion: '29/05/2026',
  liderArchivo: 'Pablo Laguna',
  responsableActual: 'Pablo Laguna',
  nota: 'Para cobrar el bonus hay que seguir en la empresa a 31 de marzo de 2027.',
  items: [
    {
      id: 'co-ebitda',
      kind: 'compania',
      corto: 'EBITDA',
      peso: 25,
      titulo: 'EBITDA SE',
      cifra: '13,1 M€',
      medida: 'Objetivo general de compañía.',
    },
    {
      id: 'co-ts',
      kind: 'departamento',
      corto: 'EBITDA TS',
      peso: 25,
      titulo: 'EBITDA Teamsport',
      cifra: '8,725 M€',
      medida: 'Pre central.',
    },
    {
      id: 'co-ia',
      kind: 'clave',
      corto: 'IA',
      peso: 25,
      titulo: 'IA para el generador de propuestas',
      cifra: null,
      medida: 'Encontrar una solución alternativa con IA. Cumplido o muy avanzado para la convención de noviembre.',
    },
    {
      id: 'co-est',
      kind: 'estrategico',
      corto: 'Estamp. / Mkt',
      peso: 25,
      titulo: 'Estampaciones y marketing',
      cifra: null,
      medida: 'El 25% se parte a mitades.',
      partes: [
        {
          peso: 12.5,
          titulo: 'Estampaciones',
          medida: 'El gasto en Aneyron, TPT, Monblason y Decorprint no supera 3 M€. Añadir al informe PBI lo que falte.',
        },
        {
          peso: 12.5,
          titulo: 'Marketing',
          medida: 'Autorizar o no acciones de marketing para entrar en los 88.000 € de gasto (lo que no va a COGS).',
        },
      ],
    },
  ],
};

export const BLANCA_ACTUAL: ObjetivoPack = {
  id: 'blanca-actual',
  persona: 'Blanca Sancho',
  rol: 'Teamsales Product Manager',
  vigente: true,
  etiqueta: 'Actuales · Target Setting',
  fuente: 'TARGET SETTING_26-27_Blanca Sancho.xlsx',
  reunion: '29/05/2026',
  liderArchivo: 'Pablo Laguna',
  responsableActual: 'Cristóbal Alonso',
  nota: 'Para cobrar el bonus hay que seguir en la empresa a 31 de marzo de 2027.',
  items: [
    {
      id: 'ba-ebitda',
      kind: 'compania',
      corto: 'EBITDA',
      peso: 25,
      titulo: 'EBITDA SE',
      cifra: '13,1 M€',
      medida: 'Objetivo general de compañía.',
    },
    {
      id: 'ba-ts',
      kind: 'departamento',
      corto: 'EBITDA TS',
      peso: 25,
      titulo: 'EBITDA Teamsport',
      cifra: '8,725 M€',
      medida: 'Pre central.',
    },
    {
      id: 'ba-stock',
      kind: 'clave',
      corto: 'Stock',
      peso: 25,
      titulo: 'Stock final almacén Equi + B2B',
      cifra: '8,5 M€',
      medida: 'Quitando todo lo derivado de Francia, consignment Puma y DVC Adidas si la consume in-line.',
    },
    {
      id: 'ba-repos',
      kind: 'estrategico',
      corto: 'Repos',
      peso: 25,
      titulo: 'Control repos',
      cifra: '7 M€',
      medida: 'No desviarnos de los 7 M€ establecidos. Modificable porcentualmente en función de la facturación.',
    },
  ],
};

export const PERSONAS = [
  { id: 'cristobal' as const, nombre: 'Cristóbal Alonso', rol: 'Tú', packs: [CRISTOBAL_ACTUAL, CRISTOBAL_ANTERIOR] },
  { id: 'blanca' as const, nombre: 'Blanca Sancho', rol: 'Tu equipo', packs: [BLANCA_ACTUAL] },
];
