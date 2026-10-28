import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, CurrentUserData } from 'src/common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {

    constructor(private usersService: UsersService) {}

    @Get()
    async getAllUsers(@CurrentUser() user: CurrentUserData){
        return await this.usersService.getAllUsers(user);
    }
}
