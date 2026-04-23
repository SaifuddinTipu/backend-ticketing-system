import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class HoldSeatsDto {
  @ApiProperty({ type: [String], example: ['seatId1', 'seatId2'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  seatIds: string[];
}
