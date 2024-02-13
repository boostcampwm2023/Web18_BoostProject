import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { DataSource, QueryRunner } from 'typeorm';
import { JwtAuthGuard } from 'src/auth/guards/jwtAuth.guard';
import Redis from 'ioredis';
import { testRedisConfig } from 'src/configs/redis.config';
import { DiariesRepository } from 'src/diaries/diaries.repository';
import { Diary } from 'src/diaries/entity/diary.entity';
import { DiaryStatus } from 'src/diaries/entity/diaryStatus';
import { MoodDegree } from 'src/diaries/utils/diaries.constant';
import { User } from 'src/users/entity/user.entity';
import { UsersRepository } from 'src/users/users.repository';
import { SocialType } from 'src/users/entity/socialType';
import { Friend } from 'src/friends/entity/friend.entity';
import { FriendsRepository } from 'src/friends/friends.repository';
import { FriendStatus } from 'src/friends/entity/friendStatus';
import { TimeUnit } from 'src/diaries/dto/timeUnit.enum';
import { subMonths } from 'date-fns';
import { TagsRepository } from 'src/tags/tags.repository';

describe('Dairies Controller (e2e)', () => {
  let app: INestApplication;
  let queryRunner: QueryRunner;
  let diariesRepository: DiariesRepository;
  let usersRepository: UsersRepository;
  let friendsRepository: FriendsRepository;
  let tagsRepository: TagsRepository;

  const redis = new Redis(testRedisConfig);
  const mockUser = {
    id: 1,
    email: 'test@test.com',
    nickname: 'test',
    socialId: 'test123',
    socialType: SocialType.NAVER,
    profileImage: 'testImage',
  } as User;

  beforeAll(async () => {
    await redis.flushall();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = mockUser;

          return true;
        },
      })
      .compile();

    const dataSource = module.get<DataSource>(DataSource);
    queryRunner = dataSource.createQueryRunner();
    dataSource.createQueryRunner = jest.fn();
    queryRunner.release = jest.fn();
    (dataSource.createQueryRunner as jest.Mock).mockReturnValue(queryRunner);

    diariesRepository = module.get<DiariesRepository>(DiariesRepository);
    usersRepository = module.get<UsersRepository>(UsersRepository);
    friendsRepository = module.get<FriendsRepository>(FriendsRepository);
    tagsRepository = module.get<TagsRepository>(TagsRepository);

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await redis.quit();
    await app.close();
  });

  beforeEach(async () => {
    await queryRunner.startTransaction();
  });

  afterEach(async () => {
    await redis.flushall();
    await queryRunner.rollbackTransaction();
  });

  describe('/diaries (POST)', () => {
    it('일기 저장 완료 후 완료 메시지 반환', async () => {
      //given
      const tagNames = ['안녕', '안녕하세요', '저리가세욧'];
      const mockDiary = {
        title: '일기 제목',
        content: '일기 내용',
        emotion: '🐶',
        tagNames,
        status: 'private',
      };
      await usersRepository.save(mockUser);

      //when
      const response = await request(app.getHttpServer()).post('/diaries').send(mockDiary);

      //then
      expect(response.status).toEqual(201);
    });

    it('request에 필요 값이 없다면, 400에러 반환', async () => {
      //given
      const mockDiary = {};
      await usersRepository.save(mockUser);

      //when
      const response = await request(app.getHttpServer()).post('/diaries').send(mockDiary);

      //then
      expect(response.status).toEqual(400);
      expect(response.body.message).toHaveLength(5);
      expect(response.body.message).toContain('title should not be empty');
      expect(response.body.message).toContain('content should not be empty');
      expect(response.body.message).toContain('emotion should not be empty');
      expect(response.body.message).toContain(
        'status must be one of the following values: private, public',
      );
      expect(response.body.message).toContain('status should not be empty');
    });

    it('유효하지 않은 status 값으로 요청 시, 400에러 반환', async () => {
      //given
      const mockDiary = {
        title: '일기 제목',
        content: '일기 내용',
        emotion: '🐶',
        status: 'wrong status',
      };
      await usersRepository.save(mockUser);

      //when
      const response = await request(app.getHttpServer()).post('/diaries').send(mockDiary);

      //then
      expect(response.status).toEqual(400);
      expect(response.body.message).toHaveLength(1);
      expect(response.body.message).toContain(
        'status must be one of the following values: private, public',
      );
    });
  });

  describe('/diaries/friends (GET)', () => {
    const mockFriend = {
      email: 'test2@test.com',
      nickname: 'test2',
      socialId: 'test2',
      socialType: SocialType.NAVER,
      profileImage: 'testImage',
    } as User;
    const mockFriendRelation = {
      sender: mockFriend,
      receiver: mockUser,
      status: FriendStatus.COMPLETE,
    } as Friend;

    beforeEach(async () => {
      await usersRepository.save(mockUser);
      await usersRepository.save(mockFriend);
      await friendsRepository.save(mockFriendRelation);
    });

    it('일기 존재 시 일기 상세 정보 반환', async () => {
      //given
      const mockDiary = {
        title: '일기 제목',
        content: '일기 내용',
        emotion: '🐶',
        status: DiaryStatus.PUBLIC,
        summary: '요약',
        mood: MoodDegree.BAD,
        author: mockFriend,
      } as Diary;

      const savedDiary = await diariesRepository.save(mockDiary);

      //when
      const response = await request(app.getHttpServer()).get(`/diaries/friends`);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.diaryList).toHaveLength(1);
      expect(body.diaryList[0].diaryId).toEqual(savedDiary.id);
    });

    it('private으로 설정된 친구 일기 조회 불가', async () => {
      //given
      const mockDiary = {
        title: '일기 제목',
        content: '일기 내용',
        emotion: '🐶',
        status: DiaryStatus.PRIVATE,
        summary: '요약',
        mood: MoodDegree.BAD,
        author: mockFriend,
      } as Diary;

      await diariesRepository.save(mockDiary);

      //when
      const response = await request(app.getHttpServer()).get(`/diaries/friends`);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.diaryList).toHaveLength(0);
    });

    it('lastIndex를 설정하면 해당 index보다 id가 작은 일기 정보 반환', async () => {
      //given
      let lastIndex = 0;
      for (let i = 0; i < 5; i++) {
        const mockDiary = {
          title: '일기 제목',
          content: '일기 내용',
          emotion: '🐶',
          status: DiaryStatus.PUBLIC,
          summary: '요약',
          mood: MoodDegree.BAD,
          author: mockFriend,
        } as Diary;

        await diariesRepository.save(mockDiary);
        if (i == 2) {
          lastIndex = mockDiary.id;
        }
      }

      //when
      const response = await request(app.getHttpServer()).get(
        `/diaries/friends?lastIndex=${lastIndex}`,
      );
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.diaryList).toHaveLength(2);
    });
  });

  describe('/diaries/:id (GET)', () => {
    it('일기 존재 시 일기 상세 정보 반환', async () => {
      //given
      const mockDiary = {
        title: '일기 제목',
        content: '일기 내용',
        emotion: '🐶',
        status: DiaryStatus.PRIVATE,
        summary: '요약',
        mood: MoodDegree.BAD,
        author: mockUser,
      } as Diary;

      const savedUser = await usersRepository.save(mockUser);
      const savedDiary = await diariesRepository.save(mockDiary);

      //when
      const response = await request(app.getHttpServer()).get(`/diaries/${savedDiary.id}`);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.emotion).toEqual('🐶');
    });

    it('일기 정보가 존재하지 않으면 400 에러 발생', async () => {
      //given
      const diaryId = 1;

      //when
      const response = await request(app.getHttpServer()).get(`/diaries/${diaryId}`);

      //then
      expect(response.status).toEqual(400);
    });

    it('상대의 private 일기에 접근하면, 403에러 발생', async () => {
      //given
      const anotherUser = {
        id: 2,
        email: 'test@test.com',
        nickname: 'test',
        socialId: 'test123',
        socialType: SocialType.NAVER,
        profileImage: 'testImage',
      } as User;
      const mockDiary = {
        title: '일기 제목',
        content: '일기 내용',
        emotion: '🐶',
        status: DiaryStatus.PRIVATE,
        summary: '요약',
        mood: MoodDegree.BAD,
        author: anotherUser,
      } as Diary;

      await usersRepository.save(anotherUser);
      await diariesRepository.save(mockDiary);

      const diaryId = mockDiary.id;

      //when
      const response = await request(app.getHttpServer()).get(`/diaries/${diaryId}`);

      //then
      expect(response.status).toEqual(403);
      expect(response.body.message).toEqual('권한이 없는 사용자입니다.');
    });
  });

  describe('/diaries/:id (PATCH)', () => {
    const mockDiary = {
      title: '일기 제목',
      content: '일기 내용',
      emotion: '🐶',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
    } as Diary;

    beforeEach(async () => {
      await usersRepository.save(mockUser);
      await diariesRepository.save(mockDiary);
    });

    it('존재하지 않는 일기에 수정 요청을 하면 400 반환', async () => {
      //given
      const updateData = {};

      //when
      const response = await request(app.getHttpServer())
        .patch(`/diaries/${mockDiary.id + 1}`)
        .send(updateData);

      //then
      expect(response.status).toEqual(400);
    });

    it('수정 정보가 존재하지 않아도 200 반환', async () => {
      //given
      const updateData = {};

      //when
      const response = await request(app.getHttpServer())
        .patch(`/diaries/${mockDiary.id}`)
        .send(updateData);

      //then
      expect(response.status).toEqual(200);
    });

    it('수정 정보가 존재하면 해당 정보만 수정 후 200 반환', async () => {
      //given
      const updateData = {
        title: 'update title',
      };

      //when
      const response = await request(app.getHttpServer())
        .patch(`/diaries/${mockDiary.id}`)
        .send(updateData);

      //then
      expect(response.status).toEqual(200);
    });
  });

  describe('/diaries/:id (DELETE)', () => {
    const mockDiary = {
      title: '일기 제목',
      content: '일기 내용',
      emotion: '🐶',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
    } as Diary;

    beforeEach(async () => {
      await usersRepository.save(mockUser);
      await diariesRepository.save(mockDiary);
    });

    it('존재하지 않는 일기에 삭제 요청을 보내면 400 반환', async () => {
      //given
      const diaryId = mockDiary.id + 1;

      //when
      const response = await request(app.getHttpServer()).delete(`/diaries/${diaryId}`);

      //then
      expect(response.status).toEqual(400);
    });

    it('존재하는 일기에 삭제 요청을 보내면 200 반환', async () => {
      //given
      const diaryId = mockDiary.id;

      //when
      const response = await request(app.getHttpServer()).delete(`/diaries/${diaryId}`);

      //then
      expect(response.status).toEqual(200);
    });
  });

  describe('/diaries/users/:id (GET)', () => {
    const mockDiary = {
      title: '일기 제목',
      content: '일기 내용',
      emotion: '🐶',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
    } as Diary;

    beforeEach(async () => {
      await usersRepository.save(mockUser);
      await diariesRepository.save(mockDiary);
    });

    it('유효하지 않은 일자 타입으로 요청이 오면 400에러 발생', async () => {
      //given
      const dto = {
        type: 'wrongType',
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/users/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);

      //then
      expect(response.status).toEqual(400);
    });

    it('일자 타입이 Day가 아니고, 유효하지 않은 일자 형식으로 요청이 오면 400에러 발생', async () => {
      //given
      const dto = {
        type: TimeUnit.Month,
        startDate: '24-01-01',
        endDate: '24-01-01',
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/users/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);

      //then
      expect(response.status).toEqual(400);
    });

    it('일자 타입이 Day가 아니면, 기간 내 일기 조회 정보 반환', async () => {
      const now = new Date();
      const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const dto = {
        type: TimeUnit.Month,
        startDate: '2024-01-01',
        endDate,
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/users/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.nickname).toEqual(mockUser.nickname);
      expect(body.diaryList).toHaveLength(1);
      expect(body.diaryList[0].diaryId).toEqual(mockDiary.id);
    });

    it('일자 타입이 Day가 아니고, 기간 내 일기가 없으면 빈 리스트 반환', async () => {
      const dto = {
        type: TimeUnit.Month,
        startDate: '2024-01-01',
        endDate: '2024-02-01',
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/users/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.nickname).toEqual(mockUser.nickname);
      expect(body.diaryList).toHaveLength(0);
    });

    it('일자 타입이 Day, lastIndex와 함께 요청이 오면 lastIndex보다 낮은 ID의 일기 조회 정보 반환', async () => {
      //given
      const dto = {
        type: TimeUnit.Day,
        lastIndex: String(mockDiary.id + 1),
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/users/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.nickname).toEqual(mockUser.nickname);
      expect(body.diaryList).toHaveLength(1);
      expect(body.diaryList[0].diaryId).toEqual(mockDiary.id);
    });

    it('일자 타입이 Day, lastIndex보다 낮은 ID의 일기가 존재하지 않으면 빈 배열 반환', async () => {
      //given
      const dto = {
        type: TimeUnit.Day,
        lastIndex: String(mockDiary.id - 1),
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/users/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.nickname).toEqual(mockUser.nickname);
      expect(body.diaryList).toHaveLength(0);
    });

    it('일자 타입이 Day, lastIndex 없이 요청이 오면 가장 최신의 일기 조회 정보 반환', async () => {
      //given
      const dto = {
        type: TimeUnit.Day,
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/users/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.nickname).toEqual(mockUser.nickname);
      expect(body.diaryList).toHaveLength(1);
      expect(body.diaryList[0].diaryId).toEqual(mockDiary.id);
    });
  });

  describe('/diaries/emotions/:userId (GET)', () => {
    const mockDiaryA = {
      title: '일기 제목',
      content: '일기 내용',
      emotion: '🐶',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
    } as Diary;
    const mockDiaryB = {
      title: '일기 제목',
      content: '일기 내용',
      emotion: '🌱',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
      createdAt: subMonths(new Date(), 2),
    } as Diary;

    beforeEach(async () => {
      await usersRepository.save(mockUser);
      await diariesRepository.save(mockDiaryA);
      await diariesRepository.save(mockDiaryB);
    });

    it('유효하지 않은 일자 타입으로 요청이 오면 400에러 발생', async () => {
      //given
      const dto = {
        startDate: '24-02-01',
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/emotions/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);

      //then
      expect(response.status).toEqual(400);
    });

    it('일자 정보가 없다면, 현재 일자로부터 한달 이내의 일기 감정 정보 반환', async () => {
      //given
      const url = `/diaries/emotions/${mockUser.id}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.emotions).toHaveLength(1);
      expect(body.emotions[0].emotion).toEqual(mockDiaryA.emotion);
    });

    it('시작/종료 일자 중 하나라도 없다면, 현재 일자로부터 한달 이내의 일기 감정 정보 반환', async () => {
      //given
      const dto = {
        startDate: '2024-01-01',
      };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/emotions/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.emotions).toHaveLength(1);
      expect(body.emotions[0].emotion).toEqual(mockDiaryA.emotion);
    });

    it('시작/종료 일자 모두 존재하면, 해당 일자 사이의 일기 감정 정보 반환', async () => {
      //given
      const now = new Date();
      const startDate = `${mockDiaryB.createdAt.getFullYear()}-${String(
        mockDiaryB.createdAt.getMonth(),
      ).padStart(2, '0')}-${String(mockDiaryB.createdAt.getDate()).padStart(2, '0')}`;
      const lastDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        '0',
      )}-${String(now.getDate()).padStart(2, '0')}`;

      const dto = { startDate, lastDate };
      const query = new URLSearchParams(dto).toString();
      const url = `/diaries/emotions/${mockUser.id}?${query}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.emotions).toHaveLength(2);
      expect([mockDiaryA.emotion, mockDiaryB.emotion]).toContain(body.emotions[0].emotion);
      expect([mockDiaryA.emotion, mockDiaryB.emotion]).toContain(body.emotions[1].emotion);
    });
  });

  describe('/diaries/mood/:userId (GET)', () => {
    const mockDiary = {
      title: '일기 제목',
      content: '일기 내용',
      emotion: '🐶',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
    } as Diary;

    beforeEach(async () => {
      await usersRepository.save(mockUser);
      await diariesRepository.save(mockDiary);
    });

    it('1년내 일기 정보가 존재하면 해당 감정 통계 반환', async () => {
      //given
      const url = `/diaries/emotions/${mockUser.id}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(body.emotions).toHaveLength(1);
      expect(body.emotions[0].emotion).toEqual(mockDiary.emotion);
    });
  });

  describe('/diaries/search/v1/:keyword (GET)', () => {
    const mockDiaryA = {
      title: '테스트 일기A',
      content: '일기 내용',
      emotion: '🐶',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
    } as Diary;

    const mockDiaryB = {
      title: '테스트 메모A',
      content: '일기 내용',
      emotion: '🐶',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
    } as Diary;

    beforeEach(async () => {
      await usersRepository.save(mockUser);
      await diariesRepository.save(mockDiaryA);
      await diariesRepository.save(mockDiaryB);
    });

    it('패턴이 일치하지 않는 일기는 반환 x', async () => {
      //given
      const keyword = encodeURIComponent('메모');
      const url = `/diaries/search/v1/${keyword}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(body.diaryList).toHaveLength(1);
      expect(body.diaryList[0].title.includes('메모')).toBeTruthy();
    });

    it('패턴이 일치하는 일기 반환', async () => {
      //given
      const keyword = encodeURIComponent('테스트');
      const url = `/diaries/search/v1/${keyword}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(body.diaryList).toHaveLength(2);
      for (let i = 0; i < body.diaryList.length; i++) {
        expect(body.diaryList[i].title.includes('테스트')).toBeTruthy();
      }
    });

    it('패턴이 일치하면서, lastIndex 이전의 일기 반환', async () => {
      //given
      const keyword = encodeURIComponent('테스트');
      const lastIndex = mockDiaryB.id;
      const url = `/diaries/search/v1/${keyword}?lastIndex=${lastIndex}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(body.diaryList).toHaveLength(1);
      expect(body.diaryList[0].title.includes('테스트')).toBeTruthy();
      expect(body.diaryList[0].diaryId < lastIndex).toBeTruthy();
    });
  });

  describe('/diaries/tags/:tagName (GET)', () => {
    const mockTag = { name: '테스트 태그' };
    const mockDiary = {
      title: '테스트 일기A',
      content: '일기 내용',
      emotion: '🐶',
      status: DiaryStatus.PRIVATE,
      summary: '요약',
      mood: MoodDegree.BAD,
      author: mockUser,
      tags: [mockTag],
    } as Diary;

    beforeEach(async () => {
      await usersRepository.save(mockUser);
      await tagsRepository.save(mockTag);
      await diariesRepository.save(mockDiary);
    });

    it('특정 태그가 포함된 일기 모두 조회', async () => {
      //given
      const tagName = encodeURIComponent('테스트 태그');
      const url = `/diaries/tags/${tagName}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.diaryList).toHaveLength(1);
      expect(body.diaryList[0].tags).toContain('테스트 태그');
    });

    it('특정 태그가 포함된 일기가 없다면 빈배열 반환', async () => {
      //given
      const tagName = encodeURIComponent('테스트');
      const url = `/diaries/tags/${tagName}`;

      //when
      const response = await request(app.getHttpServer()).get(url);
      const body = response.body;

      //then
      expect(response.status).toEqual(200);
      expect(body.diaryList).toHaveLength(0);
    });
  });
});
