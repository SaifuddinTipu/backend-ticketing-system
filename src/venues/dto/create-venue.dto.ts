import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export enum PriceTierDto {
  STANDARD = 'standard',
  PREMIUM = 'premium',
  VIP = 'vip',
}

export class SeatTemplateDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  @IsNotEmpty()
  section: string;

  @ApiProperty({ example: '1' })
  @IsString()
  @IsNotEmpty()
  row: string;

  @ApiProperty({ example: '5' })
  @IsString()
  @IsNotEmpty()
  number: string;

  @ApiProperty({ enum: PriceTierDto, example: PriceTierDto.STANDARD })
  @IsEnum(PriceTierDto)
  priceTier: PriceTierDto;
}

export class CreateVenueDto {
  @ApiProperty({ example: 'Axiata Arena' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Bukit Jalil, Kuala Lumpur' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ type: [SeatTemplateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatTemplateDto)
  seatMap: SeatTemplateDto[];
}
