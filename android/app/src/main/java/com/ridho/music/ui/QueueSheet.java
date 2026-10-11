package com.ridho.music.ui;

import android.app.Dialog;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.bottomsheet.BottomSheetDialogFragment;
import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.ui.adapter.QueueAdapter;

/**
 * Queue bottom sheet: current order with jump-to-item and per-row removal.
 */
public class QueueSheet extends BottomSheetDialogFragment implements QueueAdapter.Callback {

    private PlaybackRepository playback;
    private QueueAdapter adapter;

    @NonNull
    @Override
    public Dialog onCreateDialog(@Nullable Bundle savedInstanceState) {
        Dialog dialog = super.onCreateDialog(savedInstanceState);
        View view = LayoutInflater.from(requireContext())
                .inflate(R.layout.sheet_queue, null, false);
        dialog.setContentView(view);

        playback = App.locator().playback();
        RecyclerView list = view.findViewById(R.id.queue_list);
        list.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new QueueAdapter(this);
        list.setAdapter(adapter);
        adapter.submit(playback.queueTracks(), playback.currentIndex());

        return dialog;
    }

    @Override
    public void onItemClick(int position) {
        playback.skipToQueueItem(position);
        adapter.submit(playback.queueTracks(), playback.currentIndex());
    }

    @Override
    public void onRemoveClick(int position) {
        playback.removeFromQueue(position);
        adapter.submit(playback.queueTracks(), playback.currentIndex());
    }
}
