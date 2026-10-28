import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { QuotesService } from './quotes.service';
import {
  CreateQuoteDto,
  QuoteListQueryDto,
  UpdateQuoteDto,
} from './quotes.dto';
import {
  CurrentUser,
  CurrentUserData,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../generated/prisma/client';

@Controller('quotes')
export class QuotesController {
  constructor(private quotesService: QuotesService) {}

  @Get()
  async getQuotes(
    @Query() query: QuoteListQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.quotesService.getQuotes(user.clinicId, query);
  }

  @Get(':id/versions')
  async getVersions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.quotesService.getVersions(id, user.clinicId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.getOne(id, user.clinicId);
  }

  @Post()
  async create(
    @Body() dto: CreateQuoteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.quotesService.create(dto, user.clinicId, user.userId);
  }

  @Post(':id/revise')
  async revise(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.revise(id, user.clinicId, user.userId);
  }

  @Put(':id/send')
  async send(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.send(id, user.clinicId, user.userId);
  }

  @Roles(Role.DOCTOR)
  @Put(':id/approve')
  async approve(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.approve(id, user.clinicId, user.userId);
  }

  @Roles(Role.DOCTOR)
  @Put(':id/reject')
  async reject(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.reject(id, user.clinicId, user.userId);
  }

  @Put(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.cancel(id, user.clinicId, user.userId);
  }

  @Put(':id/expire')
  async expire(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.expire(id, user.clinicId, user.userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.quotesService.update(id, dto, user.clinicId, user.userId);
  }

  @Roles(Role.DOCTOR)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.remove(id, user.clinicId, user.userId);
  }
}
