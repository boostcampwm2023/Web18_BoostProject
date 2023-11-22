import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { NaverAuthGuard } from './guards/naverAuth.guard';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { User } from '../users/utils/user.decorator';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';
import { AuthUserDto, AuthUserResponseDto } from './dto/auth.dto';

@ApiTags('Authentication API')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('naver/login')
  @UseGuards(NaverAuthGuard)
  @ApiOperation({
    description: '네이버 소셜 로그인/회원가입을 위한 요청 api',
  })
  naverLogin(): void {}

  @Get('naver/callback')
  @UseGuards(NaverAuthGuard)
  @ApiOperation({
    description: '네이버 소셜 로그인 콜백 API',
  })
  @ApiResponse({ status: 200, description: '소셜 로그인 성공', type: AuthUserResponseDto })
  async naverLoginCallback(@User() user: AuthUserDto, @Res() res: Response): Promise<void> {
    const loginResult = await this.authService.login(user);

    res.cookie('utk', loginResult.token, { httpOnly: true });
    res.status(200).json({ userId: loginResult.userId });
  }

  @Get('refresh_token')
  @ApiOperation({
    description: 'access token 갱신 API',
  })
  @ApiResponse({ status: 200, description: 'Success' })
  async refreshAccessToken(@Req() req: Request, @Res() res: Response): Promise<void> {
    const newJwt = await this.authService.refreshAccessToken(req);

    res.cookie('utk', newJwt, { httpOnly: true });
    res.redirect('http://223.130.146.253/');
  }
}
