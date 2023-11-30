import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';

import { createDiary, updateDiary } from '@api/Edit';

import NavBar from '@components/Common/NavBar';
import Header from '@components/Edit/Header';
import Editor from '@components/Edit/Editor';
import KeywordBox from '@components/Edit/KeywordBox';

import { PAGE_URL } from '@util/constants';

interface CreateDiaryParams {
  title: string;
  content: string;
  thumbnail?: string;
  emotion: string;
  tagNames?: string[];
  status: string;
}

const Edit = () => {
  const navigate = useNavigate();
  const { state } = useLocation(); 
  const [keywordList, setKeywordList] = useState<string[]>(state?.tags || []);
  const [title, setTitle] = useState(state?.title || '');
  const [emoji, setEmoji] = useState(state?.emotion || '😁');
  const [status, setStatus] = useState(
    state && state.status === 'public' ? '공개 하기' : '나만 보기',
  );
  const [content, setContent] = useState(state?.content || ' ');

  const params: CreateDiaryParams = {
    title,
    content,
    emotion: emoji,
    tagNames: keywordList,
    status: status === '나만 보기' ? 'private' : 'public',
  };

  const createDiaryMutation = useMutation({
    mutationFn: (params: CreateDiaryParams) => createDiary(params),
  });

  const updateDiaryMutation = useMutation({
    mutationFn: (params: CreateDiaryParams) => updateDiary(params, state.diaryId),
  });

  const onSubmit = () => {
    if (!title || title.trim() === '') return;
    if (!content || content.trim() === '') return;

    if (state) {
      updateDiaryMutation.mutate(params, state.diaryId);
    } else {
      createDiaryMutation.mutate(params);
    }
  };

  if (createDiaryMutation.isError || updateDiaryMutation.isError) {
    return <div>에러!!</div>;
  }

  if (createDiaryMutation.isPending || updateDiaryMutation.isPending) {
    return <div>일기 저장중...</div>;
  }

  if (createDiaryMutation.isSuccess || updateDiaryMutation.isSuccess) {
    navigate(PAGE_URL.MY_DIARY);
  }

  return (
    <div className="flex flex-col items-center justify-start">
      <NavBar />
      <Header
        title={title}
        emoji={emoji}
        setTitle={setTitle}
        setEmoji={setEmoji}
        setStatus={setStatus}
      />
      <Editor content={content} setContent={setContent} />
      <KeywordBox keywordList={keywordList} setKeywordList={setKeywordList} onSubmit={onSubmit} />
    </div>
  );
};

export default Edit;
