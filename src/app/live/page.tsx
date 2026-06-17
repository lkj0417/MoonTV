/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { Heart, Radio, Tv } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteFavorite,
  isFavorited as checkIsFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { parseCustomTimeFormat } from '@/lib/time';

import EpgScrollableRow from '@/components/EpgScrollableRow';
import PageLayout from '@/components/PageLayout';

// Extend HTMLVideoElement type to support hls property
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

// Live channel interface
interface LiveChannel {
  id: string;
  tvgId: string;
  name: string;
  logo: string;
  group: string;
  url: string;
}

// Live source interface
interface LiveSource {
  key: string;
  name: string;
  url: string; // m3u address
  ua?: string;
  epg?: string; // program guide
  from: 'config' | 'custom';
  channelNumber?: number;
  disabled?: boolean;
}

function LivePageClient() {
  // -----------------------------------------------------------------------------
  // State variables
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'loading' | 'fetching' | 'ready'
  >('loading');
  const [loadingMessage, setLoadingMessage] = useState(
    'Loading live sources...'
  );

  const searchParams = useSearchParams();
  const router = useRouter();

  // Live source related
  const [liveSources, setLiveSources] = useState<LiveSource[]>([]);
  const [currentSource, setCurrentSource] = useState<LiveSource | null>(null);
  const currentSourceRef = useRef<LiveSource | null>(null);
  useEffect(() => {
    currentSourceRef.current = currentSource;
  }, [currentSource]);

  // Channel related
  const [, setCurrentChannels] = useState<LiveChannel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<LiveChannel | null>(
    null
  );
  useEffect(() => {
    currentChannelRef.current = currentChannel;
  }, [currentChannel]);

  const [needLoadSource] = useState(searchParams.get('source'));
  const [needLoadChannel] = useState(searchParams.get('id'));

  // Player related
  const [videoUrl, setVideoUrl] = useState('');
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [unsupportedType, setUnsupportedType] = useState<string | null>(null);

  // Source switching state
  const [isSwitchingSource, setIsSwitchingSource] = useState(false);

  // Group related
  const [groupedChannels, setGroupedChannels] = useState<{
    [key: string]: LiveChannel[];
  }>({});
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  // Tab switching
  const [activeTab, setActiveTab] = useState<'channels' | 'sources'>(
    'channels'
  );

  // Channel list collapse state
  const [isChannelListCollapsed] = useState(false);

  // Filtered channel list
  const [filteredChannels, setFilteredChannels] = useState<LiveChannel[]>([]);

  // EPG data
  const [epgData, setEpgData] = useState<{
    tvgId: string;
    source: string;
    epgUrl: string;
    programs: Array<{
      start: string;
      end: string;
      title: string;
    }>;
  } | null>(null);

  // EPG loading state
  const [isEpgLoading, setIsEpgLoading] = useState(false);

  // Favorite state
  const [favorited, setFavorited] = useState(false);
  const favoritedRef = useRef(false);
  const currentChannelRef = useRef<LiveChannel | null>(null);

  // EPG data cleanup function - remove overlapping programs, keep shorter ones, only show today
  const cleanEpgData = (
    programs: Array<{ start: string; end: string; title: string }>
  ) => {
    if (!programs || programs.length === 0) return programs;

    // Get today's date
    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const todayEnd = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    );

    // First filter today's programs (including cross-day)
    const todayPrograms = programs.filter((program) => {
      const programStart = parseCustomTimeFormat(program.start);
      const programEnd = parseCustomTimeFormat(program.end);

      const programStartDate = new Date(
        programStart.getFullYear(),
        programStart.getMonth(),
        programStart.getDate()
      );
      const programEndDate = new Date(
        programEnd.getFullYear(),
        programEnd.getMonth(),
        programEnd.getDate()
      );

      return (
        (programStartDate >= todayStart && programStartDate < todayEnd) ||
        (programEndDate >= todayStart && programEndDate < todayEnd) ||
        (programStartDate < todayStart && programEndDate >= todayEnd)
      );
    });

    // Sort by start time
    const sortedPrograms = [...todayPrograms].sort((a, b) => {
      const startA = parseCustomTimeFormat(a.start).getTime();
      const startB = parseCustomTimeFormat(b.start).getTime();
      return startA - startB;
    });

    const cleanedPrograms: Array<{
      start: string;
      end: string;
      title: string;
    }> = [];

    for (let i = 0; i < sortedPrograms.length; i++) {
      const currentProgram = sortedPrograms[i];
      const currentStart = parseCustomTimeFormat(currentProgram.start);
      const currentEnd = parseCustomTimeFormat(currentProgram.end);

      let hasOverlap = false;

      for (const existingProgram of cleanedPrograms) {
        const existingStart = parseCustomTimeFormat(existingProgram.start);
        const existingEnd = parseCustomTimeFormat(existingProgram.end);

        if (
          (currentStart >= existingStart && currentStart < existingEnd) ||
          (currentEnd > existingStart && currentEnd <= existingEnd) ||
          (currentStart <= existingStart && currentEnd >= existingEnd)
        ) {
          hasOverlap = true;
          break;
        }
      }

      if (!hasOverlap) {
        cleanedPrograms.push(currentProgram);
      } else {
        for (let j = 0; j < cleanedPrograms.length; j++) {
          const existingProgram = cleanedPrograms[j];
          const existingStart = parseCustomTimeFormat(existingProgram.start);
          const existingEnd = parseCustomTimeFormat(existingProgram.end);

          if (
            (currentStart >= existingStart && currentStart < existingEnd) ||
            (currentEnd > existingStart && currentEnd <= existingEnd) ||
            (currentStart <= existingStart && currentEnd >= existingEnd)
          ) {
            const currentDuration =
              currentEnd.getTime() - currentStart.getTime();
            const existingDuration =
              existingEnd.getTime() - existingStart.getTime();

            if (currentDuration < existingDuration) {
              cleanedPrograms[j] = currentProgram;
            }
            break;
          }
        }
      }
    }

    return cleanedPrograms;
  };

  // Player reference
  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);

  // Group scrolling related
  const groupContainerRef = useRef<HTMLDivElement>(null);
  const groupButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const channelListRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------------
  // Utility Functions
  // -----------------------------------------------------------------------------

  // Get live source list
  const fetchLiveSources = async () => {
    try {
      setLoadingStage('fetching');
      setLoadingMessage('Fetching live sources...');

      const response = await fetch('/api/live/sources');
      if (!response.ok) {
        throw new Error('Failed to get live sources');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to get live sources');
      }

      const sources = result.data;
      setLiveSources(sources);

      if (sources.length > 0) {
        const firstSource = sources[0];
        if (needLoadSource) {
          const foundSource = sources.find(
            (s: LiveSource) => s.key === needLoadSource
          );
          if (foundSource) {
            setCurrentSource(foundSource);
            await fetchChannels(foundSource);
          } else {
            setCurrentSource(firstSource);
            await fetchChannels(firstSource);
          }
        } else {
          setCurrentSource(firstSource);
          await fetchChannels(firstSource);
        }
      }

      setLoadingStage('ready');
      setLoadingMessage('Ready...');

      setTimeout(() => {
        setLoading(false);
      }, 1000);
    } catch (err) {
      console.error('Failed to get live sources:', err);
      setLiveSources([]);
      setLoading(false);
    } finally {
      // Remove source and id from URL params
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete('source');
      newSearchParams.delete('id');

      const newUrl = newSearchParams.toString()
        ? `?${newSearchParams.toString()}`
        : window.location.pathname;

      router.replace(newUrl);
    }
  };

  // Get channel list
  const fetchChannels = async (source: LiveSource) => {
    try {
      setIsVideoLoading(true);

      const response = await fetch(`/api/live/channels?source=${source.key}`);
      if (!response.ok) {
        throw new Error('Failed to get channel list');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to get channel list');
      }

      const channelsData = result.data;
      if (!channelsData || channelsData.length === 0) {
        setCurrentChannels([]);
        setGroupedChannels({});
        setFilteredChannels([]);

        setLiveSources((prevSources) =>
          prevSources.map((s) =>
            s.key === source.key ? { ...s, channelNumber: 0 } : s
          )
        );

        setIsVideoLoading(false);
        return;
      }

      const channels: LiveChannel[] = channelsData.map((channel: any) => ({
        id: channel.id,
        tvgId: channel.tvgId || channel.name,
        name: channel.name,
        logo: channel.logo,
        group: channel.group || 'Other',
        url: channel.url,
      }));

      setCurrentChannels(channels);

      setLiveSources((prevSources) =>
        prevSources.map((s) =>
          s.key === source.key ? { ...s, channelNumber: channels.length } : s
        )
      );

      if (channels.length > 0) {
        if (needLoadChannel) {
          const foundChannel = channels.find(
            (c: LiveChannel) => c.id === needLoadChannel
          );
          if (foundChannel) {
            setCurrentChannel(foundChannel);
            setVideoUrl(foundChannel.url);
            setTimeout(() => {
              scrollToChannel(foundChannel);
            }, 200);
          } else {
            setCurrentChannel(channels[0]);
            setVideoUrl(channels[0].url);
          }
        } else {
          setCurrentChannel(channels[0]);
          setVideoUrl(channels[0].url);
        }
      }

      // Group channels
      const grouped = channels.reduce((acc, channel) => {
        const group = channel.group || 'Other';
        if (!acc[group]) {
          acc[group] = [];
        }
        acc[group].push(channel);
        return acc;
      }, {} as { [key: string]: LiveChannel[] });

      setGroupedChannels(grouped);

      let targetGroup = '';
      if (needLoadChannel) {
        const foundChannel = channels.find(
          (c: LiveChannel) => c.id === needLoadChannel
        );
        if (foundChannel) {
          targetGroup = foundChannel.group || 'Other';
        }
      }

      if (!targetGroup || !grouped[targetGroup]) {
        targetGroup = Object.keys(grouped)[0] || '';
      }

      setFilteredChannels(targetGroup ? grouped[targetGroup] : channels);

      if (targetGroup) {
        setActiveTab('channels');

        setTimeout(() => {
          simulateGroupClick(targetGroup);
        }, 500);
      }

      setIsVideoLoading(false);
    } catch (err) {
      console.error('Failed to get channel list:', err);
      setCurrentChannels([]);
      setGroupedChannels({});
      setFilteredChannels([]);

      setLiveSources((prevSources) =>
        prevSources.map((s) =>
          s.key === source.key ? { ...s, channelNumber: 0 } : s
        )
      );

      setIsVideoLoading(false);
    }
  };

  // Switch live source
  const handleSourceChange = async (source: LiveSource) => {
    try {
      setIsSwitchingSource(true);

      cleanupPlayer();

      setUnsupportedType(null);

      setEpgData(null);

      setCurrentSource(source);
      await fetchChannels(source);
    } catch (err) {
      console.error('Failed to switch live source:', err);
    } finally {
      setIsSwitchingSource(false);
      setActiveTab('channels');
    }
  };

  // Switch channel
  const handleChannelChange = async (channel: LiveChannel) => {
    if (isSwitchingSource) return;

    cleanupPlayer();

    setUnsupportedType(null);

    setCurrentChannel(channel);
    setVideoUrl(channel.url);

    setTimeout(() => {
      scrollToChannel(channel);
    }, 100);

    // Get EPG data
    if (channel.tvgId && currentSource) {
      try {
        setIsEpgLoading(true);
        const response = await fetch(
          `/api/live/epg?source=${currentSource.key}&tvgId=${channel.tvgId}`
        );
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const cleanedData = {
              ...result.data,
              programs: cleanEpgData(result.data.programs),
            };
            setEpgData(cleanedData);
          }
        }
      } catch (error) {
        console.error('Failed to get EPG data:', error);
      } finally {
        setIsEpgLoading(false);
      }
    } else {
      setEpgData(null);
      setIsEpgLoading(false);
    }
  };

  // Scroll to specific channel position
  const scrollToChannel = (channel: LiveChannel) => {
    if (!channelListRef.current) return;

    const targetElement = channelListRef.current.querySelector(
      `[data-channel-id="${channel.id}"]`
    ) as HTMLButtonElement;

    if (targetElement) {
      const container = channelListRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = targetElement.getBoundingClientRect();

      const scrollTop =
        container.scrollTop +
        (elementRect.top - containerRect.top) -
        containerRect.height / 2 +
        elementRect.height / 2;

      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: 'smooth',
      });
    }
  };

  // Simulate group click
  const simulateGroupClick = (group: string, retryCount = 0) => {
    if (!groupContainerRef.current) {
      if (retryCount < 10) {
        setTimeout(() => {
          simulateGroupClick(group, retryCount + 1);
        }, 200);
        return;
      } else {
        return;
      }
    }

    const targetButton = groupContainerRef.current.querySelector(
      `[data-group="${group}"]`
    ) as HTMLButtonElement;

    if (targetButton) {
      handleGroupChange(group);

      const container = groupContainerRef.current;
      const buttonLeft = targetButton.offsetLeft;
      const buttonWidth = targetButton.offsetWidth;
      const containerWidth = container.clientWidth;

      const leftPosition = buttonLeft - containerWidth / 2 + buttonWidth / 2;

      container.scrollTo({
        left: Math.max(0, leftPosition),
        behavior: 'smooth',
      });
    } else {
      if (retryCount < 10) {
        setTimeout(() => {
          simulateGroupClick(group, retryCount + 1);
        }, 200);
      }
    }
  };

  // Group change
  const handleGroupChange = (group: string) => {
    setSelectedGroup(group);

    if (groupedChannels[group]) {
      setFilteredChannels(groupedChannels[group]);
    }
  };

  // Cleanup player
  const cleanupPlayer = useCallback(() => {
    if (artPlayerRef.current) {
      try {
        artPlayerRef.current.destroy();
        artPlayerRef.current = null;
      } catch (err) {
        console.error('Failed to destroy player:', err);
      }
    }
  }, []);

  // Initialize player
  const initPlayer = useCallback(() => {
    if (!artRef.current || !videoUrl || !currentChannel) return;

    cleanupPlayer();

    try {
      const art = new Artplayer({
        container: artRef.current,
        url: videoUrl,
        autoplay: true,
        autoSize: true,
        autoMini: true,
        loop: false,
        flip: true,
        playbackRate: true,
        aspectRatio: true,
        setting: true,
        hotkey: true,
        pip: true,
        mutex: true,
        backdrop: true,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: true,
        miniProgressBar: true,
        playsInline: true,
        lock: true,
        fastForward: true,
        autoPlayback: true,
        airplay: true,
        theme: '#10b981',
        lang: navigator.language.toLowerCase(),
        moreVideoAttr: {
          crossOrigin: 'anonymous',
          preload: 'auto',
        },
        customType: {
          m3u8: function (video: HTMLVideoElement, url: string) {
            if (video.hls) {
              video.hls.destroy();
              video.hls = null;
            }
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
              });
              hls.loadSource(url);
              hls.attachMedia(video);
              video.hls = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = url;
            } else {
              art.notice.show = 'Unsupported M3U8 stream format';
            }
          },
        },
      });

      artPlayerRef.current = art;

      art.on('ready', () => {
        setIsVideoLoading(false);
      });

      art.on('error', () => {
        setIsVideoLoading(false);
      });

      art.on('video:canplay', () => {
        setIsVideoLoading(false);
      });
    } catch (err) {
      console.error('Failed to initialize player:', err);
      setIsVideoLoading(false);
    }
  }, [videoUrl, currentChannel, cleanupPlayer]);

  // Initialize player when videoUrl or channel changes
  useEffect(() => {
    if (videoUrl && currentChannel) {
      if (artRef.current) {
        initPlayer();
      } else {
        const checkArtRef = setInterval(() => {
          if (artRef.current) {
            clearInterval(checkArtRef);
            initPlayer();
          }
        }, 100);

        return () => clearInterval(checkArtRef);
      }
    }

    return () => {
      cleanupPlayer();
    };
  }, [videoUrl, currentChannel, initPlayer, cleanupPlayer]);

  // Initialize on mount
  useEffect(() => {
    fetchLiveSources();
    return () => {
      cleanupPlayer();
    };
  }, []);

  // Handle favorite toggle
  const handleToggleFavorite = async () => {
    if (!currentChannel) return;

    const currentSourceKey = currentSourceRef.current?.key || 'default';

    const newFavState = !favorited;
    setFavorited(newFavState);
    favoritedRef.current = newFavState;

    try {
      if (newFavState) {
        const favorite = {
          title: currentChannel.name,
          source_name: currentSource?.name || 'Unknown',
          cover: currentChannel.logo,
          year: new Date().getFullYear().toString(),
          save_time: Date.now(),
          search_title: currentChannel.name,
          total_episodes: 0,
        };
        await saveFavorite(currentSourceKey, currentChannel.id, favorite);
      } else {
        await deleteFavorite(currentSourceKey, currentChannel.id);
      }
    } catch (err) {
      console.error('Favorite operation failed:', err);
      setFavorited(!newFavState);
      favoritedRef.current = !newFavState;
    }
  };

  // Check favorite status
  useEffect(() => {
    const checkFavorite = async () => {
      if (!currentChannel) {
        setFavorited(false);
        favoritedRef.current = false;
        return;
      }

      const currentSourceKey = currentSourceRef.current?.key || 'default';
      const isFav = await checkIsFavorited(currentSourceKey, currentChannel.id);
      setFavorited(isFav);
      favoritedRef.current = isFav;
    };

    checkFavorite();
  }, [currentChannel]);

  // Subscribe to data updates
  useEffect(() => {
    const unsub = subscribeToDataUpdates('favoritesUpdated', () => {
      if (currentChannelRef.current) {
        const currentSourceKey = currentSourceRef.current?.key || 'default';
        checkIsFavorited(currentSourceKey, currentChannelRef.current.id).then(
          (isFav) => {
            setFavorited(isFav);
            favoritedRef.current = isFav;
          }
        );
      }
    });

    return unsub;
  }, []);

  if (liveSources.length === 0 && !loading) {
    return (
      <PageLayout activePath='/live'>
        <div className='flex flex-col items-center justify-center min-h-[60vh] text-center px-4'>
          <Radio className='h-16 w-16 text-gray-300 dark:text-gray-600 mb-4' />
          <h2 className='text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2'>
            No Live Sources Available
          </h2>
          <p className='text-gray-500 dark:text-gray-400 max-w-md'>
            No live sources configured. Please contact the site administrator to
            add live sources.
          </p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/live'>
      <div className='flex flex-col h-full'>
        {/* Loading overlay */}
        {loading && (
          <div className='fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center'>
            <div className='text-center max-w-md mx-auto px-6'>
              <div className='relative mb-8'>
                <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center'>
                  <Radio className='text-white w-10 h-10' />
                  <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-ping'></div>
                </div>
              </div>
              <div className='space-y-3'>
                <p className='text-xl font-semibold text-white'>
                  {loadingMessage}
                </p>
                <div className='flex justify-center gap-2'>
                  {loadingStage === 'fetching' && (
                    <>
                      <div className='w-3 h-3 bg-green-500 rounded-full animate-bounce [animation-delay:-0.3s]'></div>
                      <div className='w-3 h-3 bg-green-500 rounded-full animate-bounce [animation-delay:-0.15s]'></div>
                      <div className='w-3 h-3 bg-green-500 rounded-full animate-bounce'></div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className='md:px-4 py-4'>
          {/* Main content area */}
          <div className='grid grid-cols-1 lg:grid-cols-6 gap-3 md:gap-4'>
            {/* Video player area */}
            <div
              className={`${
                isChannelListCollapsed ? 'lg:col-span-5' : 'lg:col-span-5'
              } md:col-span-1`}
            >
              <div className='relative bg-black rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700'>
                {/* Video player container */}
                <div className='aspect-video max-h-[50vh]'>
                  <div ref={artRef} className='w-full h-full' />

                  {/* Unsupported type fallback */}
                  {unsupportedType && !isVideoLoading && (
                    <div className='absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm'>
                      <div className='space-y-4'>
                        <h3 className='text-xl font-semibold text-white'>
                          Unsupported Live Stream Type
                        </h3>
                        <div className='bg-orange-500/20 border border-orange-500/30 rounded-lg p-4'>
                          <p className='text-orange-300 font-medium'>
                            Current stream type:{' '}
                            <span className='text-white font-bold'>
                              {unsupportedType.toUpperCase()}
                            </span>
                          </p>
                          <p className='text-sm text-orange-200 mt-2'>
                            Currently only M3U8 format streams are supported
                          </p>
                        </div>
                        <p className='text-sm text-gray-300'>
                          Please try other channels
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Video loading overlay */}
                  {isVideoLoading && (
                    <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg border border-white/0 dark:border-white/30 flex items-center justify-center z-[500] transition-all duration-300'>
                      <div className='text-center max-w-md mx-auto px-6'>
                        <div className='relative mb-8'>
                          <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                            <div className='text-white text-4xl'>📺</div>
                            <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
                          </div>
                        </div>
                        <div className='space-y-2'>
                          <p className='text-xl font-semibold text-white animate-pulse'>
                            Loading IPTV...
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Channel list */}
            <div
              className={`h-[300px] lg:h-full md:overflow-hidden transition-all duration-300 ease-in-out ${
                isChannelListCollapsed
                  ? 'md:col-span-1 lg:hidden lg:opacity-0 lg:scale-95'
                  : 'md:col-span-1 lg:opacity-100 lg:scale-100'
              }`}
            >
              <div className='md:ml-2 px-4 py-0 h-full rounded-xl bg-black/10 dark:bg-white/5 flex flex-col border border-white/0 dark:border-white/30 overflow-hidden'>
                {/* Main Tab switching */}
                <div className='flex mb-1 -mx-6 flex-shrink-0'>
                  <div
                    onClick={() => setActiveTab('channels')}
                    className={`flex-1 py-3 px-6 text-center cursor-pointer transition-all duration-200 font-medium
                      ${
                        activeTab === 'channels'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-700 hover:text-green-600 bg-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:text-green-400 hover:bg-black/3 dark:hover:bg-white/3'
                      }
                    `.trim()}
                  >
                    Channels
                  </div>
                  <div
                    onClick={() => setActiveTab('sources')}
                    className={`flex-1 py-3 px-6 text-center cursor-pointer transition-all duration-200 font-medium
                      ${
                        activeTab === 'sources'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-700 hover:text-green-600 bg-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:text-green-400 hover:bg-black/3 dark:hover:bg-white/3'
                      }
                    `.trim()}
                  >
                    Sources
                  </div>
                </div>

                {/* Channels Tab content */}
                {activeTab === 'channels' && (
                  <>
                    {/* Group labels */}
                    <div className='flex items-center gap-4 mb-4 border-b border-gray-300 dark:border-gray-700 -mx-6 px-6 flex-shrink-0'>
                      {isSwitchingSource && (
                        <div className='flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400'>
                          <div className='w-2 h-2 bg-amber-500 rounded-full animate-pulse'></div>
                          Switching source...
                        </div>
                      )}

                      <div
                        className='flex-1 overflow-x-auto'
                        ref={groupContainerRef}
                        onMouseEnter={() => {
                          const container = groupContainerRef.current;
                          if (container) {
                            const handleWheel = (e: WheelEvent) => {
                              if (
                                container.scrollWidth > container.clientWidth
                              ) {
                                e.preventDefault();
                                container.scrollLeft += e.deltaY;
                              }
                            };
                            container.addEventListener('wheel', handleWheel, {
                              passive: false,
                            });
                            (container as any)._wheelHandler = handleWheel;
                          }
                        }}
                        onMouseLeave={() => {
                          const container = groupContainerRef.current;
                          if (container && (container as any)._wheelHandler) {
                            container.removeEventListener(
                              'wheel',
                              (container as any)._wheelHandler
                            );
                            delete (container as any)._wheelHandler;
                          }
                        }}
                      >
                        <div className='flex gap-4 min-w-max'>
                          {Object.keys(groupedChannels).map((group, index) => (
                            <button
                              key={group}
                              data-group={group}
                              ref={(el) => {
                                groupButtonRefs.current[index] = el;
                              }}
                              onClick={() => handleGroupChange(group)}
                              disabled={isSwitchingSource}
                              className={`w-20 relative py-2 text-sm font-medium transition-colors flex-shrink-0 text-center overflow-hidden
                                 ${
                                   isSwitchingSource
                                     ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                                     : selectedGroup === group
                                     ? 'text-green-500 dark:text-green-400'
                                     : 'text-gray-700 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400'
                                 }
                               `.trim()}
                            >
                              <div
                                className='px-1 overflow-hidden whitespace-nowrap'
                                title={group}
                              >
                                {group}
                              </div>
                              {selectedGroup === group &&
                                !isSwitchingSource && (
                                  <div className='absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 dark:bg-green-400' />
                                )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Channel list */}
                    <div
                      ref={channelListRef}
                      className='flex-1 overflow-y-auto space-y-2 pb-4'
                    >
                      {filteredChannels.length > 0 ? (
                        filteredChannels.map((channel) => {
                          const isActive = channel.id === currentChannel?.id;
                          return (
                            <button
                              key={channel.id}
                              data-channel-id={channel.id}
                              onClick={() => handleChannelChange(channel)}
                              disabled={isSwitchingSource}
                              className={`w-full p-3 rounded-lg text-left transition-all duration-200 ${
                                isSwitchingSource
                                  ? 'opacity-50 cursor-not-allowed'
                                  : isActive
                                  ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <div className='flex items-center gap-3'>
                                <div className='w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden'>
                                  {channel.logo ? (
                                    <img
                                      src={`/api/proxy/logo?url=${encodeURIComponent(
                                        channel.logo
                                      )}&source=${currentSource?.key || ''}`}
                                      alt={channel.name}
                                      className='w-full h-full rounded object-contain'
                                      loading='lazy'
                                    />
                                  ) : (
                                    <Tv className='w-5 h-5 text-gray-500' />
                                  )}
                                </div>
                                <div className='flex-1 min-w-0'>
                                  <div
                                    className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'
                                    title={channel.name}
                                  >
                                    {channel.name}
                                  </div>
                                  <div
                                    className='text-xs text-gray-500 dark:text-gray-400 mt-1'
                                    title={channel.group}
                                  >
                                    {channel.group}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className='flex flex-col items-center justify-center py-12 text-center'>
                          <div className='w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4'>
                            <Tv className='w-8 h-8 text-gray-400 dark:text-gray-600' />
                          </div>
                          <p className='text-gray-500 dark:text-gray-400 font-medium'>
                            No available channels
                          </p>
                          <p className='text-sm text-gray-400 dark:text-gray-500 mt-1'>
                            Please select another source or try again later
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Sources Tab content */}
                {activeTab === 'sources' && (
                  <div className='flex flex-col h-full mt-4'>
                    <div className='flex-1 overflow-y-auto space-y-2 pb-20'>
                      {liveSources.length > 0 ? (
                        liveSources.map((source) => {
                          const isCurrentSource =
                            source.key === currentSource?.key;
                          return (
                            <div
                              key={source.key}
                              onClick={() =>
                                !isCurrentSource && handleSourceChange(source)
                              }
                              className={`flex items-start gap-3 px-2 py-3 rounded-lg transition-all select-none duration-200 relative
                                ${
                                  isCurrentSource
                                    ? 'bg-green-500/10 dark:bg-green-500/20 border-green-500/30 border'
                                    : 'hover:bg-gray-200/50 dark:hover:bg-white/10 hover:scale-[1.02] cursor-pointer'
                                }`.trim()}
                            >
                              <div className='w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0'>
                                <Radio className='w-6 h-6 text-gray-500' />
                              </div>

                              <div className='flex-1 min-w-0'>
                                <div className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
                                  {source.name}
                                </div>
                                <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                                  {!source.channelNumber ||
                                  source.channelNumber === 0
                                    ? '-'
                                    : `${source.channelNumber} channels`}
                                </div>
                              </div>

                              {isCurrentSource && (
                                <div className='absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full'></div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className='flex flex-col items-center justify-center py-12 text-center'>
                          <div className='w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4'>
                            <Radio className='w-8 h-8 text-gray-400 dark:text-gray-600' />
                          </div>
                          <p className='text-gray-500 dark:text-gray-400 font-medium'>
                            No available live sources
                          </p>
                          <p className='text-sm text-gray-400 dark:text-gray-500 mt-1'>
                            Please check network connection or contact
                            administrator
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Current channel info */}
        {currentChannel && (
          <div className='pt-4'>
            <div className='flex flex-col lg:flex-row gap-4'>
              <div className='w-full flex-shrink-0'>
                <div className='flex items-center gap-4'>
                  <div className='w-20 h-20 bg-gray-300 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden'>
                    {currentChannel.logo ? (
                      <img
                        src={`/api/proxy/logo?url=${encodeURIComponent(
                          currentChannel.logo
                        )}&source=${currentSource?.key || ''}`}
                        alt={currentChannel.name}
                        className='w-full h-full rounded object-contain'
                        loading='lazy'
                      />
                    ) : (
                      <Tv className='w-10 h-10 text-gray-500' />
                    )}
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-3'>
                      <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 truncate'>
                        {currentChannel.name}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite();
                        }}
                        className='flex-shrink-0 hover:opacity-80 transition-opacity'
                        title={
                          favorited
                            ? 'Remove from favorites'
                            : 'Add to favorites'
                        }
                      >
                        <FavoriteIcon filled={favorited} />
                      </button>
                    </div>
                    <p className='text-sm text-gray-500 dark:text-gray-400 truncate'>
                      {currentSource?.name} {' > '} {currentChannel.group}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* EPG Program Guide */}
            <EpgScrollableRow
              programs={epgData?.programs || []}
              currentTime={new Date()}
              isLoading={isEpgLoading}
            />
          </div>
        )}
      </div>
    </PageLayout>
  );
}

// FavoriteIcon component
const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-6 w-6'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444'
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-6 w-6 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

function LivePageGuard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    setEnabled(!!runtimeConfig?.ENABLE_WEB_LIVE);
  }, []);

  if (enabled === null) {
    return <div>Loading...</div>;
  }

  if (!enabled) {
    return (
      <PageLayout activePath='/live'>
        <div className='flex flex-col items-center justify-center min-h-[60vh] text-center px-4'>
          <Radio className='h-16 w-16 text-gray-300 dark:text-gray-600 mb-4' />
          <h2 className='text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2'>
            网页直播未开启
          </h2>
          <p className='text-gray-500 dark:text-gray-400 max-w-md'>
            当前站点未启用网页直播功能，请联系站点管理员开启。
          </p>
        </div>
      </PageLayout>
    );
  }

  return <LivePageClient />;
}

export default function LivePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LivePageGuard />
    </Suspense>
  );
}
