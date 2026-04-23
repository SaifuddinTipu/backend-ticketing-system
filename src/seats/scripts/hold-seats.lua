-- Atomic multi-seat hold via Redis SET NX
-- KEYS  = seat hold keys (one per seat: seat:hold:{eventId}:{seatId})
-- ARGV[1] = userId
-- ARGV[2] = TTL in seconds
--
-- Returns 1 on full success, 0 if ANY seat is already held (rolls back all prior claims)
for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then
    -- Roll back every seat claimed so far in this iteration
    for j = 1, i - 1 do
      redis.call('DEL', KEYS[j])
    end
    return 0
  end
  redis.call('SET', KEYS[i], ARGV[1], 'EX', ARGV[2])
end
return 1
