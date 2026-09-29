import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto, UpdateQuoteDto } from './quotes.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('quotes')
export class QuotesController {
  constructor(private quotesService: QuotesService) {}

  @Get()
  async getQuotes(@CurrentUser() user: CurrentUserData) {
    return await this.quotesService.getQuotes(user.clinicId);
  }

  @Post()
  async create(@Body() dto: CreateQuoteDto, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.create(dto, user.clinicId, user.userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.update(id, dto, user.clinicId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.quotesService.remove(id, user.clinicId);
  }
}