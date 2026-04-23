import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Confirm order from held seats (MongoDB transaction)',
    description:
      'Verifies holds, creates tickets, marks seats booked, deletes Redis holds — all atomically.',
  })
  @ApiHeader({ name: 'x-user-id', description: 'Caller user ID', required: true })
  @ApiResponse({ status: 201, description: 'Order confirmed with embedded tickets' })
  @ApiResponse({ status: 403, description: 'Seats not held by this user' })
  @ApiResponse({ status: 404, description: 'One or more seats not found' })
  create(
    @Body() dto: CreateOrderDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.ordersService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List orders for the calling user' })
  @ApiHeader({ name: 'x-user-id', description: 'Caller user ID', required: true })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated order list' })
  findAll(
    @Headers('x-user-id') userId: string,
    @Query() query: ListOrdersDto,
  ) {
    return this.ordersService.findAll(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order by ID' })
  @ApiParam({ name: 'id', description: 'Order MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
