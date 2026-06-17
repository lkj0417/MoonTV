'use client';

import {
  Bell,
  BellOff,
  Calendar,
  ChevronDown,
  Clock,
  Star,
  Tv,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { AnimeScheduleDay, AnimeScheduleItem } from '@/lib/anime-schedule';

import PageLayout from '@/components/PageLayout';

// Local storage key for tracking followed anime
const FOLLOWED_ANIME_KEY = 'anime_schedule_followed';

function getFollowedAnime(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(FOLLOWED_ANIME_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveFollowedAnime(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FOLLOWED_ANIME_KEY, JSON.stringify(Array.from(ids)));
}

function AnimeScheduleClient() {
  const [schedule, setSchedule] = useState<AnimeScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week');

  useEffect(() => {
    // Load followed anime from localStorage
    setFollowedIds(getFollowedAnime());
  }, []);

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/anime-schedule');
        const json = await res.json();
        if (json.code === 200) {
          setSchedule(json.data);
        }
      } catch (err) {
        // Fetch error handled silently
      } finally {
        setLoading(false);
      }
    };
    fetchSchedule();
  }, []);

  const toggleFollow = useCallback((id: string) => {
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveFollowedAnime(next);
      return next;
    });
  }, []);

  const today = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d; // Sunday = 7 in our system
  }, []);

  const followedItems = useMemo(() => {
    return schedule.flatMap((day) =>
      day.items.filter((item) => followedIds.has(item.id))
    );
  }, [schedule, followedIds]);

  const weekdayColors: Record<number, string> = {
    1: 'from-rose-500 to-pink-500',
    2: 'from-amber-500 to-orange-500',
    3: 'from-emerald-500 to-green-500',
    4: 'from-sky-500 to-blue-500',
    5: 'from-violet-500 to-purple-500',
    6: 'from-cyan-500 to-teal-500',
    7: 'from-red-500 to-rose-500',
  };

  const weekdayLabels: Record<number, string> = {
    1: '周一',
    2: '周二',
    3: '周三',
    4: '周四',
    5: '周五',
    6: '周六',
    7: '周日',
  };

  if (loading) {
    return (
      <PageLayout activePath='/anime-schedule'>
        <div className='px-4 sm:px-10 py-4 sm:py-8'>
          <div className='mb-8'>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200 mb-1'>
              追番表
            </h1>
            <p className='text-sm text-gray-600 dark:text-gray-400'>
              新番放送日程
            </p>
          </div>
          <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3'>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className='animate-pulse'>
                <div className='h-8 bg-gray-200 dark:bg-gray-800 rounded-lg mb-3' />
                <div className='space-y-3'>
                  <div className='aspect-[2/3] bg-gray-200 dark:bg-gray-800 rounded-lg' />
                  <div className='h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4' />
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  const renderAnimeCard = (item: AnimeScheduleItem, compact = false) => (
    <div
      key={item.id}
      className={`group relative bg-white dark:bg-gray-800/60 rounded-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 ${
        compact ? 'flex items-center gap-3 p-2' : ''
      }`}
    >
      {/* Poster */}
      <Link
        href={item.douban_id ? `/play?douban=${item.douban_id}` : '#'}
        className={`block relative overflow-hidden ${
          compact ? 'w-14 h-20 flex-shrink-0 rounded-lg' : 'aspect-[2/3]'
        }`}
      >
        <Image
          src={item.poster}
          alt={item.title_cn || item.title}
          className='w-full h-full object-cover group-hover:scale-105 transition-transform duration-300'
          loading='lazy'
          fill
          sizes='(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 14vw'
          unoptimized
        />
        {item.current_episode && item.episodes && (
          <span className='absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded'>
            {item.current_episode}/{item.episodes}
          </span>
        )}
      </Link>

      {/* Info */}
      <div className={`${compact ? 'flex-1 min-w-0' : 'p-3'}`}>
        <Link
          href={item.douban_id ? `/play?douban=${item.douban_id}` : '#'}
          className={`block font-medium text-gray-800 dark:text-gray-200 hover:text-green-600 dark:hover:text-green-400 transition-colors line-clamp-2 ${
            compact ? 'text-sm' : 'text-sm sm:text-base'
          }`}
        >
          {item.title_cn || item.title}
        </Link>

        {!compact && (
          <>
            {item.time && (
              <div className='flex items-center gap-1 mt-1.5 text-xs text-gray-500 dark:text-gray-400'>
                <Clock className='w-3 h-3' />
                <span>{item.time}</span>
              </div>
            )}
            {item.genres.length > 0 && (
              <div className='flex flex-wrap gap-1 mt-2'>
                {item.genres.slice(0, 3).map((genre) => (
                  <span
                    key={genre}
                    className='text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 rounded'
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {/* Follow button */}
        <button
          onClick={() => toggleFollow(item.id)}
          className={`mt-2 flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-all ${
            followedIds.has(item.id)
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600 dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-green-900/20 dark:hover:text-green-400'
          } ${compact ? 'mt-1' : ''}`}
        >
          {followedIds.has(item.id) ? (
            <>
              <Bell className='w-3 h-3' />
              已追
            </>
          ) : (
            <>
              <BellOff className='w-3 h-3' />
              追番
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <PageLayout activePath='/anime-schedule'>
      <div className='px-4 sm:px-10 py-4 sm:py-8'>
        {/* Header */}
        <div className='mb-6 sm:mb-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200 mb-1'>
                追番表
              </h1>
              <p className='text-sm text-gray-600 dark:text-gray-400'>
                每周新番放送日程
              </p>
            </div>
            <div className='flex items-center gap-2'>
              {/* View toggle */}
              <div className='flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1'>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    viewMode === 'week'
                      ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Calendar className='w-3.5 h-3.5 inline mr-1' />
                  周视图
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Tv className='w-3.5 h-3.5 inline mr-1' />
                  追番列表
                </button>
              </div>
            </div>
          </div>
        </div>

        {viewMode === 'list' ? (
          /* Followed anime list view */
          <div className='max-w-4xl mx-auto'>
            <div className='mb-6'>
              <h2 className='text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                <Bell className='w-5 h-5 text-green-500' />
                我的追番
                <span className='text-sm font-normal text-gray-500'>
                  ({followedItems.length})
                </span>
              </h2>
            </div>

            {followedItems.length === 0 ? (
              <div className='text-center py-16'>
                <BellOff className='w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4' />
                <p className='text-gray-500 dark:text-gray-400 mb-2'>
                  还没有追番
                </p>
                <p className='text-sm text-gray-400 dark:text-gray-500'>
                  在周视图中点击追番按钮来添加
                </p>
              </div>
            ) : (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
                {followedItems.map((item) => (
                  <div key={item.id}>{renderAnimeCard(item, true)}</div>
                ))}
              </div>
            )}

            {/* All schedule in list form */}
            <div className='mt-10'>
              <h2 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4'>
                全部新番
              </h2>
              <div className='space-y-6'>
                {schedule.map((day) => (
                  <div key={day.weekday}>
                    <button
                      onClick={() =>
                        setExpandedDay(
                          expandedDay === day.weekday ? null : day.weekday
                        )
                      }
                      className='flex items-center gap-2 w-full text-left mb-3 group'
                    >
                      <span
                        className={`inline-block w-14 text-center py-1 text-xs font-bold text-white rounded-full bg-gradient-to-r ${
                          weekdayColors[day.weekday]
                        }`}
                      >
                        {weekdayLabels[day.weekday]}
                      </span>
                      <span className='text-sm text-gray-500 dark:text-gray-400'>
                        {day.items.length} 部
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition-transform ${
                          expandedDay === day.weekday ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {expandedDay === day.weekday && (
                      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-16'>
                        {day.items.length === 0 ? (
                          <p className='text-sm text-gray-400 col-span-full py-4'>
                            暂无更新
                          </p>
                        ) : (
                          day.items.map((item) => renderAnimeCard(item, true))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Week grid view */
          <div>
            {/* Today indicator */}
            <div className='flex items-center gap-2 mb-6 text-sm text-gray-500 dark:text-gray-400'>
              <Star className='w-4 h-4 text-amber-500' />
              今天是 {weekdayLabels[today]}，标注色块为今日更新
            </div>

            {/* 7-day grid */}
            <div className='grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3'>
              {schedule.map((day) => {
                const isToday = day.weekday === today;
                return (
                  <div
                    key={day.weekday}
                    className={`rounded-2xl p-3 border transition-all ${
                      isToday
                        ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10 ring-1 ring-green-200 dark:ring-green-800'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-white/40 dark:bg-gray-800/40'
                    }`}
                  >
                    {/* Day header */}
                    <div className='text-center mb-3'>
                      <span
                        className={`inline-block px-4 py-1 text-xs font-bold text-white rounded-full bg-gradient-to-r ${
                          weekdayColors[day.weekday]
                        } ${
                          isToday
                            ? 'ring-2 ring-offset-1 ring-green-300 dark:ring-green-600'
                            : ''
                        }`}
                      >
                        {weekdayLabels[day.weekday]}
                        {isToday && ' 今天'}
                      </span>
                    </div>

                    {/* Anime cards */}
                    {day.items.length === 0 ? (
                      <div className='text-center py-8'>
                        <p className='text-xs text-gray-400 dark:text-gray-500'>
                          暂无更新
                        </p>
                      </div>
                    ) : (
                      <div className='space-y-2.5'>
                        {day.items.map((item) => (
                          <div key={item.id}>{renderAnimeCard(item)}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default function AnimeSchedulePage() {
  return (
    <Suspense>
      <AnimeScheduleClient />
    </Suspense>
  );
}
