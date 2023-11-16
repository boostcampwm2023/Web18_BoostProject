import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Diary } from './diary.entity';

@Entity('permissions')
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @ManyToMany(() => Diary, { cascade: true })
  diaries: Diary[];
}
