import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto, QuoteListQueryDto, UpdateQuoteDto } from './quotes.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../generated/prisma/client';

@Controller('quotes')
export class QuotesController {
  constructor(private quotesService: QuotesService) {}

  @Get()
  async getQuotes(@Query() query: QuoteListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.getQuotes(user.clinicId, query);
  }

  @Post()
  async create(@Body() dto: CreateQuoteDto, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.create(dto, user.clinicId, user.userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.update(id, dto, user.clinicId, user.userId);
  }

  @Roles(Role.DOCTOR)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.remove(id, user.clinicId, user.userId);
  }
}