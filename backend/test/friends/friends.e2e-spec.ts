import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { DataSource, QueryRunner } from 'typeorm';
import { UsersRepository } from 'src/users/users.repository';
import { SocialType } from 'src/users/entity/socialType';
import { FriendsRepository } from 'src/friends/friends.repository';
import { FriendStatus } from 'src/friends/entity/friendStatus';
import * as cookieParser from 'cookie-parser';
import { testLogin } from 'test/utils/testLogin';
import { User } from 'src/users/entity/user.entity';

describe('FriendsController (e2e)', () => {
  let app: INestApplication;
  let queryRunner: QueryRunner;
  let friendsRepository: FriendsRepository;
  let usersRepository: UsersRepository;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const dataSource = module.get<DataSource>(DataSource);
    queryRunner = dataSource.createQueryRunner();
    dataSource.createQueryRunner = jest.fn();
    queryRunner.release = jest.fn();
    (dataSource.createQueryRunner as jest.Mock).mockReturnValue(queryRunner);

    friendsRepository = module.get<FriendsRepository>(FriendsRepository);
    usersRepository = module.get<UsersRepository>(UsersRepository);

    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let user: User;
  let accessToken: string;

  const userInfo = {
    socialId: '1234',
    socialType: SocialType.NAVER,
    nickname: 'test',
    email: 'test@abc.com',
    profileImage: 'profile image',
  };
  const friend1Info = {
    socialId: '1',
    socialType: SocialType.NAVER,
    nickname: '친구1',
    email: 'friend1@abc.com',
    profileImage: 'profile image',
  };
  const friend2Info = {
    socialId: '2',
    socialType: SocialType.NAVER,
    nickname: '친구2',
    email: 'friend2@abc.com',
    profileImage: 'profile image',
  };

  beforeEach(async () => {
    await queryRunner.startTransaction();

    user = await usersRepository.save(userInfo);
    accessToken = await testLogin(user);
  });

  afterEach(async () => {
    await queryRunner.rollbackTransaction();
  });

  describe('/friends/:userId (GET)', () => {
    it('친구 목록 조회', async () => {
      // given
      const url = `/friends/${user.id}`;
      const friend1 = await usersRepository.save(friend1Info);
      const friend2 = await usersRepository.save(friend2Info);
      const relation1 = await friendsRepository.save({ sender: user, receiver: friend1 });
      const relation2 = await friendsRepository.save({ sender: friend2, receiver: user });

      await friendsRepository.update(relation1.id, { status: FriendStatus.COMPLETE });
      await friendsRepository.update(relation2.id, { status: FriendStatus.COMPLETE });

      // when
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
      expect(response.body.friends).toHaveLength(2);
      expect(response.body.friends[0].nickname).toEqual('친구1');
    });

    it('친구가 없는 경우 빈 배열 반환', async () => {
      // given
      const url = `/friends/${user.id}`;

      // when
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
      expect(response.body.friends).toEqual([]);
    });
  });

  describe('/friends/:friendId (DELETE)', () => {
    it('친구 삭제', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/${friend.id}`;
      const relation = await friendsRepository.save({ sender: user, receiver: friend });

      await friendsRepository.update(relation.id, { status: FriendStatus.COMPLETE });

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
    });

    it('friend id가 본인 id인 경우 예외 발생', async () => {
      // given
      const url = `/friends/${user.id}`;

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('나와는 친구신청 관리를 할 수 없습니다.');
    });

    it('friend id가 친구가 아닌 사용자의 id인 경우 예외 발생', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/${friend.id}`;

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('존재하지 않는 관계입니다.');
    });

    it('friend id가 친구신청 진행 중인 사용자의 id인 경우 예외 발생', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/${friend.id}`;

      await friendsRepository.save({ sender: user, receiver: friend });

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('존재하지 않는 관계입니다.');
    });
  });

  describe('/friends/request/:userId (GET)', () => {
    it('특정 사용자의 친구신청 목록 조회', async () => {
      // given
      const url = `/friends/request/${user.id}`;
      const friend1 = await usersRepository.save(friend1Info);
      const friend2 = await usersRepository.save(friend2Info);

      await friendsRepository.save({ sender: user, receiver: friend1 });
      await friendsRepository.save({ sender: friend2, receiver: user });

      // when
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
      expect(response.body.strangers).toHaveLength(2);
      expect(response.body.strangers[0].nickname).toEqual('친구1');
    });

    it('진행 중인 친구신청이 없는 경우 빈 배열 반환', async () => {
      // given
      const url = `/friends/request/${user.id}`;

      // when
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
      expect(response.body.strangers).toEqual([]);
    });
  });

  describe('/friends/request/:userId (POST)', () => {
    it('친구 신청하기', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/request/${friend.id}`;

      // when
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(201);
    });

    it('자신에게 친구신청 보낸 경우 예외 발생', async () => {
      // given
      const url = `/friends/request/${user.id}`;

      // when
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('나에게 친구신청 보낼 수 없습니다.');
    });

    it('해당 사용자에게 중복으로 친구신청한 경우 예외 발생', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/request/${friend.id}`;

      await friendsRepository.save({ sender: user, receiver: friend });

      // when
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('이미 친구신청을 하셨습니다.');
    });

    it('해당 사용자에게 이미 친구신청을 받은 경우 예외 발생', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/request/${friend.id}`;

      await friendsRepository.save({ sender: friend, receiver: user });

      // when
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('상대의 친구신청을 확인해주세요.');
    });
  });

  describe('/friends/request/:receiverId (DELETE)', () => {
    it('내가 보낸 친구신청 취소', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/request/${friend.id}`;

      await friendsRepository.save({ sender: user, receiver: friend });

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
    });

    it('사용자 id와 친구 id가 일치하는 경우 예외 발생', async () => {
      // given
      const url = `/friends/request/${user.id}`;

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('나와는 친구신청 관리를 할 수 없습니다.');
    });

    it('이전에 보낸 친구신청이 없는 경우 예외 발생', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/request/${friend.id}`;

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('해당 사용자 사이의 친구신청 기록이 없습니다.');
    });

    it('이전에 보낸 친구신청이 없고, 상대가 친구신청을 보낸 경우 예외 발생', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/request/${friend.id}`;

      await friendsRepository.save({ sender: friend, receiver: user });

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('상대의 친구신청을 확인하세요.');
    });
  });

  describe('/friends/allow/:senderId (POST)', () => {
    it('받은 친구신청 수락', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/allow/${friend.id}`;

      await friendsRepository.save({ sender: friend, receiver: user });

      // when
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(201);
    });

    it('사용자 id와 친구 id가 일치하는 경우 예외 발생', async () => {
      // given
      const url = `/friends/allow/${user.id}`;

      // when
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('나와는 친구신청 관리를 할 수 없습니다.');
    });

    it('이전에 받은 친구신청이 없는 경우 예외 발생', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/allow/${friend.id}`;

      // when
      const response = await request(app.getHttpServer())
        .post(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('해당 사용자 사이의 친구신청 기록이 없습니다.');
    });
  });

  describe('/friends/allow/:senderId (DELETE)', () => {
    it('친구신청 거절', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/allow/${friend.id}`;

      await friendsRepository.save({ sender: friend, receiver: user });

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
    });

    it('사용자 id와 친구 id가 일치하는 경우 예외 발생', async () => {
      // given
      const url = `/friends/allow/${user.id}`;

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('나와는 친구신청 관리를 할 수 없습니다.');
    });

    it('이전에 받은 친구신청이 없는 경우 예외 발생', async () => {
      // given
      const friend = await usersRepository.save(friend1Info);
      const url = `/friends/allow/${friend.id}`;

      // when
      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual('해당 사용자 사이의 친구신청 기록이 없습니다.');
    });
  });

  describe('/friends/search/:nickname (GET)', () => {
    const friend3Info = {
      socialId: '3',
      socialType: SocialType.NAVER,
      nickname: '나는프렌드',
      email: 'friend3@abc.com',
      profileImage: 'profile image',
    };

    it('친구목록에서 검색어를 포함하는 닉네임의 사용자 조회', async () => {
      // given
      const url = `/friends/search/${encodeURIComponent('친구')}`;
      const friend1 = await usersRepository.save(friend1Info);
      const friend2 = await usersRepository.save(friend2Info);
      const friend3 = await usersRepository.save(friend3Info);

      const relation1 = await friendsRepository.save({ sender: user, receiver: friend1 });
      const relation2 = await friendsRepository.save({ sender: user, receiver: friend2 });
      const relation3 = await friendsRepository.save({ sender: user, receiver: friend3 });

      await friendsRepository.update(relation1.id, { status: FriendStatus.COMPLETE });
      await friendsRepository.update(relation2.id, { status: FriendStatus.COMPLETE });
      await friendsRepository.update(relation3.id, { status: FriendStatus.COMPLETE });

      // when
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].nickname).toEqual('친구1');
    });

    it('검색어를 포함하는 닉네임의 친구가 없는 경우 빈 배열 반환', async () => {
      // given
      const url = `/friends/search/${encodeURIComponent('친구')}`;
      const friend3 = await usersRepository.save(friend3Info);
      const relation3 = await friendsRepository.save({ sender: user, receiver: friend3 });

      await friendsRepository.update(relation3.id, { status: FriendStatus.COMPLETE });

      // when
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Cookie', [`utk=${accessToken}`]);

      // then
      expect(response.statusCode).toEqual(200);
      expect(response.body).toEqual([]);
    });
  });
});
