package com.ridho.music.ui.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.DiffUtil;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.ridho.music.R;
import com.ridho.music.data.entity.PlaylistEntity;
import com.ridho.music.domain.model.Track;
import com.ridho.music.player.MediaItemConverter;

import java.util.ArrayList;
import java.util.List;

/** Playlist cards shown in the Library "Playlists" chip. */
public class PlaylistAdapter extends RecyclerView.Adapter<PlaylistAdapter.VH> {

    public interface Callback {
        void onPlaylistClick(@NonNull PlaylistEntity playlist);

        void onPlaylistLongClick(@NonNull PlaylistEntity playlist, @NonNull View anchor);
    }

    private final List<PlaylistEntity> items = new ArrayList<>();
    private final Callback callback;

    public PlaylistAdapter(Callback callback) {
        this.callback = callback;
    }

    public void submit(List<PlaylistEntity> newItems) {
        DiffUtil.DiffResult result = DiffUtil.calculateDiff(new DiffUtil.Callback() {
            @Override public int getOldListSize() { return items.size(); }
            @Override public int getNewListSize() { return newItems.size(); }
            @Override public boolean areItemsTheSame(int o, int n) {
                return items.get(o).id == newItems.get(n).id;
            }
            @Override public boolean areContentsTheSame(int o, int n) {
                return items.get(o).name.equals(newItems.get(n).name);
            }
        });
        items.clear();
        items.addAll(newItems);
        result.dispatchUpdatesTo(this);
    }

    @NonNull
    @Override
    public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new VH(LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_playlist, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull VH holder, int position) {
        PlaylistEntity p = items.get(position);
        holder.name.setText(p.name);
        holder.icon.setImageResource(R.drawable.ic_queue);
        holder.itemView.setOnClickListener(v -> callback.onPlaylistClick(p));
        holder.itemView.setOnLongClickListener(v -> {
            callback.onPlaylistLongClick(p, holder.itemView);
            return true;
        });
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class VH extends RecyclerView.ViewHolder {
        final ImageView icon;
        final TextView name;

        VH(@NonNull View itemView) {
            super(itemView);
            icon = itemView.findViewById(R.id.playlist_icon);
            name = itemView.findViewById(R.id.playlist_name);
        }
    }
}
