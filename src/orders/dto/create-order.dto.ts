import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({
    type: [String],
    example: ['seatId1', 'seatId2'],
    description: 'IDs of seats currently held by the caller (x-user-id header)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  seatIds: string[];
}
