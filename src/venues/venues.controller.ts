import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';

@ApiTags('venues')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a venue' })
  @ApiResponse({ status: 201, description: 'Venue created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Body() dto: CreateVenueDto) {
    return this.venuesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all venues' })
  @ApiResponse({ status: 200, description: 'List of venues' })
  findAll() {
    return this.venuesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a venue by ID' })
  @ApiParam({ name: 'id', description: 'Venue MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Venue found' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  findOne(@Param('id') id: string) {
    return this.venuesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a venue' })
  @ApiParam({ name: 'id', description: 'Venue MongoDB ObjectId' })
  @ApiResponse({ status: 200, description: 'Venue updated' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  update(@Param('id') id: string, @Body() dto: UpdateVenueDto) {
    return this.venuesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a venue' })
  @ApiParam({ name: 'id', description: 'Venue MongoDB ObjectId' })
  @ApiResponse({ status: 204, description: 'Venue deleted' })
  @ApiResponse({ status: 404, description: 'Venue not found' })
  remove(@Param('id') id: string) {
    return this.venuesService.remove(id);
  }
}
