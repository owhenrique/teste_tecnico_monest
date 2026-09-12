/** Contrato único de endereço, independente do provedor que respondeu. */
export interface Address {
  /** Somente dígitos, sem máscara. */
  cep: string;
  logradouro: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
}
