import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { getDiaryDayList } from '@api/DiaryList';
import { getSearchResults } from '@api/KeywordSearch';

import { viewTypes, searchOptionsType } from '@type/pages/MyDiary';
import { InfiniteDiaryListProps } from '@type/components/Common/DiaryList';

import NavBar from '@components/Common/NavBar';
import DiaryListItem from '@components/Common/DiaryListItem';
import KeywordSearch from '@components/MyDiary/KeywordSearch';
import WeekContainer from '@components/MyDiary/WeekContainer';
import ViewType from '@components/MyDiary/ViewType';
import MonthContainer from '@components/MyDiary/MonthContainer';

import { DIARY_VIEW_TYPE } from '@util/constants';

const MyDiary = () => {
  const [viewType, setViewType] = useState<viewTypes>('Day');
  const [keyword, setKeyword] = useState<string>('');
  const [searchFlag, setSearchFlag] = useState(false);
  const [selected, setSelected] = useState<searchOptionsType>('키워드');

  const { data: diaryData } = useInfiniteQuery<
    any,
    Error,
    InfiniteDiaryListProps,
    [string, string | null],
    { userId: string; type: viewTypes; lastIndex: number }
  >({
    queryKey: ['myDayDiaryList', localStorage.getItem('userId')],

    queryFn: getDiaryDayList,
    initialPageParam: {
      userId: localStorage.getItem('userId') as string,
      type: 'Day',
      lastIndex: 2e9,
    },
    getNextPageParam: (lastPage) => {
      return lastPage && lastPage.diaryList.length >= 5
        ? {
            userId: localStorage.getItem('userId') as string,
            type: 'Day',
            lastIndex: lastPage?.diaryList.at(-1).diaryId,
          }
        : undefined;
    },
  });

  const { data: searchData } = useInfiniteQuery<
    any,
    Error,
    InfiniteDiaryListProps,
    [string, string | null, searchOptionsType],
    { keyword: string; lastIndex: number; type: searchOptionsType }
  >({
    queryKey: ['searchDataList', keyword, selected],
    queryFn: getSearchResults,
    initialPageParam: {
      keyword: keyword,
      type: selected,
      lastIndex: 2e9,
    },
    getNextPageParam: (lastPage) => {
      return lastPage && lastPage.diaryList.length >= 5
        ? {
            keyword: keyword,
            type: selected,
            lastIndex: lastPage?.diaryList.at(-1).diaryId,
          }
        : undefined;
    },
    enabled: !!searchFlag && !!keyword,
  });

  return (
    <>
      <NavBar />
      <main className="mx-auto mb-28 flex max-w-6xl flex-col items-center justify-start">
        <header className="my-10 flex w-full items-start justify-between">
          <KeywordSearch
            keyword={keyword}
            selected={selected}
            setKeyword={setKeyword}
            setSelected={setSelected}
            setSearchFlag={setSearchFlag}
          />
          <ViewType setViewType={setViewType} viewType={viewType} />
        </header>
        <section className="flex flex-col items-center">
          {viewType === DIARY_VIEW_TYPE.DAY &&
            !keyword &&
            diaryData?.pages.map((page, pageIndex) =>
              page.diaryList.map((item, itemIndex) => (
                <DiaryListItem diaryItem={item} key={pageIndex + itemIndex} />
              )),
            )}
          {viewType === DIARY_VIEW_TYPE.DAY &&
            keyword &&
            searchData?.pages.map((page, pageIndex) =>
              page.diaryList.map((item, itemIndex) => (
                <DiaryListItem diaryItem={item} key={String(pageIndex) + String(itemIndex)} />
              )),
            )}
          {viewType === DIARY_VIEW_TYPE.WEEK && <WeekContainer />}
          {viewType === DIARY_VIEW_TYPE.MONTH && <MonthContainer />}
        </section>
      </main>
    </>
  );
};

export default MyDiary;
