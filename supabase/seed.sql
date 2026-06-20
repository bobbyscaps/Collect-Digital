insert into public.badges (key, name, description, badge_type)
values
  ('diamond_hands', 'Diamond Hands', 'Holds conviction positions through volatility.', 'collector'),
  ('true_collector', 'True Collector', 'Builds quality portfolio with patience.', 'collector'),
  ('smart_flipper', 'Smart Flipper', 'Positive and efficient timing on exits.', 'flipper'),
  ('elite_flipper', 'Elite Flipper', 'Profitable high-volume trader.', 'flipper'),
  ('community_loyalist', 'Community Loyalist', 'Strong participation in holder communities.', 'collector')
on conflict (key) do nothing;
