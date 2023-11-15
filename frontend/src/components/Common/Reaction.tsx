import emojiIcon from '../../assets/image/reactionEmoji.svg';

interface ReactionProps {
  count: number;
}

export const Reaction = ({ count }: ReactionProps) => {
  return (
    <div className="flex justify-start items-center">
      <img src={emojiIcon} alt="리액션 아이콘" />
      <p className="color text-base font-bold text-default">친구들의 반응 {count}개</p>
    </div>
  );
};
