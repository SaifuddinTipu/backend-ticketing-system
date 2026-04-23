import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Venue, VenueDocument } from './schemas/venue.schema';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { VenueNotFoundException } from '../common/exceptions/domain.exceptions';

@Injectable()
export class VenuesService {
  constructor(@InjectModel(Venue.name) private venueModel: Model<VenueDocument>) {}

  create(dto: CreateVenueDto): Promise<VenueDocument> {
    return this.venueModel.create(dto);
  }

  findAll(): Promise<VenueDocument[]> {
    return this.venueModel.find().exec();
  }

  async findOne(id: string): Promise<VenueDocument> {
    const venue = await this.venueModel.findById(id).exec();
    if (!venue) throw new VenueNotFoundException(id);
    return venue;
  }

  async update(id: string, dto: UpdateVenueDto): Promise<VenueDocument> {
    const venue = await this.venueModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!venue) throw new VenueNotFoundException(id);
    return venue;
  }

  async remove(id: string): Promise<void> {
    const result = await this.venueModel.findByIdAndDelete(id).exec();
    if (!result) throw new VenueNotFoundException(id);
  }
}
