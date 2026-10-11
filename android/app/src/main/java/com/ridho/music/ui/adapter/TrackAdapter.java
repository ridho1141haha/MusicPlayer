package com.ridho.music.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.DiffUtil;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.ridho.music.R;
import com.ridho.music.domain.model.Track;
import com.ridho.music.player.MediaItemConverter;
import com.ridho.music.ui.FormatUtils;

import java.util.ArrayList;
import java.util.List;

/** Vertical track row used by Home favorites, Library lists and playlist detail. */
public class TrackAdapter extends RecyclerView.Adapter<TrackAdapter.TrackViewHolder> {

    public interface Callback {
        void onTrackClick(@NonNull Track track, int position);

        void onTrackMenu(@NonNull Track track, @NonNull View anchor);
    }

    private final List<Track> items = new ArrayList<>();
    private final Callback callback;

    public TrackAdapter(Callback callback) {
        this.callback = callback;
    }

    public List<Track> currentItems() {
        return items;
    }

    public void submit(List<Track> newItems) {
        DiffUtil.DiffResult result = DiffUtil.calculateDiff(new DiffCallback(items, newItems));
        items.clear();
        if (newItems != null) items.addAll(newItems);
        result.dispatchUpdatesTo(this);
    }

    @NonNull
    @Override
    public TrackViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_track, parent, false);
        return new TrackViewHolder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull TrackViewHolder holder, int position) {
        holder.bind(items.get(position));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    class TrackViewHolder extends RecyclerView.ViewHolder {
        final ImageView artwork;
        final TextView title;
        final TextView subtitle;
        final TextView duration;
        final ImageButton more;

        TrackViewHolder(@NonNull View itemView) {
            super(itemView);
            artwork = itemView.findViewById(R.id.track_artwork);
            title = itemView.findViewById(R.id.track_title);
            subtitle = itemView.findViewById(R.id.track_subtitle);
            duration = itemView.findViewById(R.id.track_duration);
            more = itemView.findViewById(R.id.track_more);
        }

        void bind(Track track) {
            title.setText(track.title);
            subtitle.setText(track.album == null ? track.artist
                    : track.artist + " · " + track.album);
            duration.setText(FormatUtils.formatDuration(track.durationMs));
            Glide.with(artwork)
                    .load(MediaItemConverter.artworkUri(track))
                    .placeholder(R.drawable.bg_artwork_placeholder)
                    .centerCrop()
                    .into(artwork);
            itemView.setOnClickListener(v -> {
                int pos = getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION && callback != null) {
                    callback.onTrackClick(items.get(pos), pos);
                }
            });
            more.setOnClickListener(v -> {
                int pos = getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION && callback != null) {
                    callback.onTrackMenu(items.get(pos), more);
                }
            });
        }
    }

    private static class DiffCallback extends DiffUtil.Callback {
        private final List<Track> oldList;
        private final List<Track> newList;

        DiffCallback(List<Track> oldList, List<Track> newList) {
            this.oldList = oldList;
            this.newList = newList;
        }

        @Override public int getOldListSize() { return oldList.size(); }
        @Override public int getNewListSize() { return newList.size(); }

        @Override public boolean areItemsTheSame(int oldPos, int newPos) {
            return oldList.get(oldPos).id.equals(newList.get(newPos).id);
        }

        @Override public boolean areContentsTheSame(int oldPos, int newPos) {
            Track a = oldList.get(oldPos);
            Track b = newList.get(newPos);
            return a.title.equals(b.title)
                    && a.artist.equals(b.artist)
                    && java.util.Objects.equals(a.album, b.album)
                    && a.durationMs == b.durationMs;
        }
    }
}
