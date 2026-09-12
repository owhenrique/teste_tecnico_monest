import { IsString } from 'class-validator';

export class GetCepParamsDto {
  @IsString()
  cep!: string;
}
