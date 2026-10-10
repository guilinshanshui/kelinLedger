/**
 * 首页 / 日程看板之间的刷新信号。
 *
 * 日程改动后调用 markScheduleHomeDirty 写入房间号并广播，
 * 首页在 onShow 时比对 storage 里的房间号，决定是否重新拉取，
 * 避免每次切页都打一次接口。
 */

export const SCHEDULE_REFRESH_KEY = 'schedule_board_dirty_room';

export function markScheduleHomeDirty(roomId) {
  if (roomId == null || roomId === '') return;
  uni.setStorageSync(SCHEDULE_REFRESH_KEY, String(roomId));
  uni.$emit('schedule_board_refresh');
}
